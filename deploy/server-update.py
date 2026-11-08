#!/usr/bin/env python3
"""Deploy the images GitHub Actions built for the newest `master` revision of
Hexagonia to hexabeta (beta) and then hexagonia (production), with health
checks and rollback.

.github/workflows/docker-images.yml pushes `ghcr.io/<owner>/hexagonia-server`
and `-web` as `sha-<short>` (public). This script pulls the images of the newest
revision, tags them locally as `:latest` and lets Mariner deploy each convoy,
whose compose file (pwnhub-podman-stacks) runs `:latest` with
`pull_policy: never`; Mariner resolves the convoys' secrets (CHEST). Beta goes
first: if it does not come up, production is not touched. If a convoy fails,
the previous revision is deployed again everywhere.

Run by hexagonia-update.timer (user pwnhub); configuration in deploy.json
(see deploy/server.example.json).
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

SERVICES = ("server", "web")


def run(args, cwd=None, capture=False):
    result = subprocess.run(args, cwd=cwd, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else None


def atomic_json(path, value):
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(value, indent=2) + "\n")
    temp.chmod(0o600)
    temp.replace(path)


def image(config, service):
    return f"{config['registry']}/hexagonia-{service}"


def tag_of(revision):
    return "sha-" + revision[:7]


def pull(config, revision):
    """Fetches both images of a revision; False while CI has not published them yet."""
    for service in SERVICES:
        ref = image(config, service) + ":" + tag_of(revision)
        if subprocess.run(["podman", "image", "exists", ref]).returncode == 0:
            continue
        result = subprocess.run(["podman", "pull", "--quiet", ref],
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            if "manifest unknown" in result.stderr or "not found" in result.stderr:
                return False
            raise RuntimeError("Pulling " + ref + " failed: " + result.stderr.strip())
    return True


def revision_of(container):
    try:
        info = json.loads(run(["podman", "inspect", container], capture=True))[0]
    except (subprocess.CalledProcessError, IndexError):
        return None
    return (info["Config"].get("Labels") or {}).get("org.opencontainers.image.revision")


def mariner_deploy(config, convoy_id):
    """Deploys a convoy through Mariner and waits for the deployment's result."""
    mariner = config["mariner"]
    headers = {"Authorization": "Bearer " + Path(mariner["token_file"]).read_text().strip()}
    req = urllib.request.Request(f"{mariner['url']}/api/convoys/{convoy_id}/action/deploy",
                                 method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=600) as response:
        deployment_id = int(json.load(response)["deployment"])
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        req = urllib.request.Request(f"{mariner['url']}/api/deployments/{deployment_id}", headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            deployment = json.load(response)
        if deployment.get("finished_at"):
            if not deployment.get("ok"):
                raise RuntimeError("Mariner deployment %d failed: %s"
                                   % (deployment_id, str(deployment.get("log", ""))[-500:]))
            return
        time.sleep(3)
    raise RuntimeError("Mariner deployment %d did not finish within 15 minutes" % deployment_id)


def wait_ready(convoy, revision):
    """Both containers run the revision, and the web answers the page and the API."""
    deadline = time.monotonic() + 240
    last = "not started"
    while time.monotonic() < deadline:
        try:
            for service in SERVICES:
                name = convoy["containers"][service]
                info = json.loads(run(["podman", "inspect", name], capture=True))[0]
                if not info["State"]["Running"]:
                    raise RuntimeError(name + " is not running")
                if (info["Config"].get("Labels") or {}).get("org.opencontainers.image.revision") != revision:
                    raise RuntimeError(name + " does not run " + revision[:7])
            for path in ("/", "/api/health"):
                with urllib.request.urlopen(convoy["web_url"] + path, timeout=10) as response:
                    if response.status != 200 or not response.read(1):
                        raise RuntimeError("no content for " + path)
            return
        except Exception as error:  # noqa: BLE001 - retried until the deadline
            last = str(error)
        time.sleep(3)
    raise RuntimeError(convoy["name"] + " not ready with " + revision[:7] + ": " + last)


def deploy(config, revision, convoys):
    for service in SERVICES:
        run(["podman", "tag", image(config, service) + ":" + tag_of(revision), image(config, service) + ":latest"])
    for convoy in convoys:
        mariner_deploy(config, convoy["id"])
        wait_ready(convoy, revision)


def prune(config, keep_revisions):
    """Keep the newest `keep_images` revision tags per service plus the given revisions."""
    keep = int(config.get("keep_images", 3))
    keep_tags = {tag_of(r) for r in keep_revisions if r}
    for service in SERVICES:
        ref = image(config, service)
        rows = run(["podman", "images", "--filter", "reference=" + ref,
                    "--format", "{{.CreatedAt}}\t{{.Tag}}"], capture=True).splitlines()
        tags = [line.split("\t")[1] for line in sorted(rows, reverse=True) if "\t" in line]
        for tag in [t for t in tags if t.startswith("sha-")][keep:]:
            if tag not in keep_tags:
                subprocess.run(["podman", "rmi", ref + ":" + tag],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", default="/opt/hexagonia-update/deploy.json")
    parser.add_argument("--force", action="store_true", help="deploy even if the revision already runs")
    args = parser.parse_args()
    os.umask(0o077)
    config_path = Path(args.config)
    config = json.loads(config_path.read_text())
    source = Path(config["source"])
    convoys = config["convoys"]
    lock = (config_path.parent / "update.lock").open("w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("Another Hexagonia update is running")
        return
    run(["git", "fetch", "--quiet", "origin", config.get("branch", "master")], cwd=source)
    revision = run(["git", "rev-parse", "FETCH_HEAD"], cwd=source, capture=True)
    state_path = config_path.parent / "deployed.json"
    previous = json.loads(state_path.read_text()) if state_path.exists() else {}
    live = {revision_of(c["containers"][s]) for c in convoys for s in SERVICES}
    if live == {revision} and not args.force:
        if previous.get("revision") != revision:
            atomic_json(state_path, {"revision": revision, "deployed_at": int(time.time()),
                                     "previous_revision": previous.get("revision")})
        print("Hexagonia is current: " + revision)
        return
    if run(["git", "status", "--porcelain"], cwd=source, capture=True):
        raise RuntimeError("Source checkout has local changes; refusing to overwrite them")
    # GitHub Actions publishes the images; until then the timer retries.
    if not pull(config, revision):
        print("Waiting for CI images of " + revision)
        return
    run(["git", "checkout", "--quiet", "--detach", revision], cwd=source)
    rollback = previous.get("revision")
    try:
        deploy(config, revision, convoys)
    except Exception:
        if rollback and rollback != revision and pull(config, rollback):
            print("Deployment failed; restoring Hexagonia " + rollback, flush=True)
            run(["git", "checkout", "--quiet", "--detach", rollback], cwd=source)
            deploy(config, rollback, convoys)
        raise
    atomic_json(state_path, {"revision": revision, "deployed_at": int(time.time()),
                             "previous_revision": rollback})
    prune(config, {revision, rollback})
    # Service/timer files are symlinked from this checkout; load any updated unit settings.
    run(["systemctl", "--user", "daemon-reload"])
    print("Deployed Hexagonia revision " + revision)


if __name__ == "__main__":
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print("Hexagonia update failed: " + str(error), file=sys.stderr)
        sys.exit(1)
