group "default" {
  targets = ["web", "server"]
}

target "web" {
  context = "."
  dockerfile = "apps/web/Dockerfile"
  target = "runner"
}

target "server" {
  context = "."
  dockerfile = "apps/server/Dockerfile"
  target = "runner"
}
