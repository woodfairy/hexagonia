from __future__ import annotations

import argparse
import json
import pathlib
import re
from dataclasses import dataclass
from typing import Any, Iterable


ROOT = pathlib.Path(__file__).resolve().parents[2]
GENERATOR_PATH = ROOT / "references" / "seafarers" / "generator-main.js"
DECODED_STRINGS_PATH = ROOT / "references" / "seafarers" / "decoded_strings.tsv"
OFFICIAL_SCENARIO_KEYS = (
    "heading-for-new-shores-3",
    "heading-for-new-shores-4",
    "heading-for-new-shores-56",
    "the-four-islands-3",
    "the-four-islands-4",
    "the-six-islands",
    "through-the-desert-3",
    "through-the-desert-4",
    "through-the-desert-56",
    "the-fog-island-3",
    "the-fog-island-4",
    "the-fog-island-56",
    "the-forgotten-tribe-34",
    "the-forgotten-tribe-56",
    "cloth-for-catan-34",
    "cloth-for-catan-56",
    "the-pirate-islands-34",
    "the-pirate-islands-56",
    "the-wonders-of-catan-34",
    "the-wonders-of-catan-56",
)


def load_decoded_strings() -> list[str]:
    entries: list[str] = []
    for line in DECODED_STRINGS_PATH.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        _, value = line.split("\t", 1)
        entries.append(value)
    return entries


def decode_57fc(strings: list[str], first_arg: int) -> str:
    return strings[first_arg - 0xB7]


def decode_118f84(strings: list[str], second_arg: int) -> str:
    return decode_57fc(strings, second_arg - 0x21F)


def decode_4ceda3(strings: list[str], second_arg: int) -> str:
    return decode_57fc(strings, second_arg - 0x2DB)


def split_top_level(text: str, delimiter: str) -> list[str]:
    parts: list[str] = []
    start = 0
    brace = 0
    bracket = 0
    paren = 0
    quote = ""
    escaped = False
    for index, char in enumerate(text):
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = ""
            continue
        if char in ("'", '"'):
            quote = char
            continue
        if char == "{":
            brace += 1
            continue
        if char == "}":
            brace -= 1
            continue
        if char == "[":
            bracket += 1
            continue
        if char == "]":
            bracket -= 1
            continue
        if char == "(":
            paren += 1
            continue
        if char == ")":
            paren -= 1
            continue
        if char == delimiter and brace == 0 and bracket == 0 and paren == 0:
            parts.append(text[start:index].strip())
            start = index + 1
    tail = text[start:].strip()
    if tail:
        parts.append(tail)
    return parts


def extract_data_section(source: str) -> str:
    start = source.find("function combineCounts")
    if start < 0:
        raise RuntimeError("combineCounts block not found")
    scenario_start = source.find("const scenarioInfo", start)
    if scenario_start < 0:
        raise RuntimeError("scenarioInfo block not found")
    end = find_statement_end(source, scenario_start)
    return source[start:end]


def find_statement_end(text: str, start: int) -> int:
    brace = 0
    bracket = 0
    paren = 0
    quote = ""
    escaped = False
    index = start
    while index < len(text):
        char = text[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = ""
            index += 1
            continue
        if char in ("'", '"'):
            quote = char
            index += 1
            continue
        if char == "{":
            brace += 1
            index += 1
            continue
        if char == "}":
            brace -= 1
            index += 1
            continue
        if char == "[":
            bracket += 1
            index += 1
            continue
        if char == "]":
            bracket -= 1
            index += 1
            continue
        if char == "(":
            paren += 1
            index += 1
            continue
        if char == ")":
            paren -= 1
            index += 1
            continue
        if char == ";" and brace == 0 and bracket == 0 and paren == 0:
            return index + 1
        index += 1
    raise RuntimeError("Statement end not found")


def extract_statement(text: str, marker: str) -> str:
    start = text.find(marker)
    if start < 0:
        raise RuntimeError(f"{marker!r} not found")
    end = find_statement_end(text, start)
    return text[start:end]


def split_top_level_statements(text: str) -> list[str]:
    statements: list[str] = []
    start = 0
    brace = 0
    bracket = 0
    paren = 0
    quote = ""
    escaped = False
    for index, char in enumerate(text):
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = ""
            continue
        if char in ("'", '"'):
            quote = char
            continue
        if char == "{":
            brace += 1
            continue
        if char == "}":
            brace -= 1
            if brace == 0 and bracket == 0 and paren == 0:
                next_index = index + 1
                while next_index < len(text) and text[next_index].isspace():
                    next_index += 1
                for prefix in ("const ", "let ", "var ", "function "):
                    if text.startswith(prefix, next_index):
                        statement = text[start:index + 1].strip()
                        if statement:
                            statements.append(statement)
                        start = next_index
                        break
            continue
        if char == "[":
            bracket += 1
            continue
        if char == "]":
            bracket -= 1
            continue
        if char == "(":
            paren += 1
            continue
        if char == ")":
            paren -= 1
            continue
        if char == ";" and brace == 0 and bracket == 0 and paren == 0:
            statement = text[start:index].strip()
            if statement:
                statements.append(statement)
            start = index + 1
    tail = text[start:].strip()
    if tail:
        statements.append(tail)
    return statements


def split_key_value(entry: str) -> tuple[str, str]:
    brace = 0
    bracket = 0
    paren = 0
    quote = ""
    escaped = False
    for index, char in enumerate(entry):
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = ""
            continue
        if char in ("'", '"'):
            quote = char
            continue
        if char == "{":
            brace += 1
            continue
        if char == "}":
            brace -= 1
            continue
        if char == "[":
            bracket += 1
            continue
        if char == "]":
            bracket -= 1
            continue
        if char == "(":
            paren += 1
            continue
        if char == ")":
            paren -= 1
            continue
        if char == ":" and brace == 0 and bracket == 0 and paren == 0:
            return entry[:index].strip(), entry[index + 1:].strip()
    raise ValueError(f"Missing top-level ':' in entry {entry[:120]!r}")


@dataclass
class Token:
    type: str
    value: Any
    raw: str


class TokenStream:
    def __init__(self, text: str):
        self.text = text
        self.index = 0
        self.length = len(text)
        self.current = self._read_token()

    def peek(self) -> Token:
        return self.current

    def next(self) -> Token:
        token = self.current
        self.current = self._read_token()
        return token

    def expect(self, raw: str) -> Token:
        token = self.next()
        if token.raw != raw:
            raise ValueError(f"Expected {raw!r}, got {token.raw!r}")
        return token

    def match(self, raw: str) -> bool:
        if self.current.raw == raw:
            self.next()
            return True
        return False

    def _skip_whitespace(self) -> None:
        while self.index < self.length and self.text[self.index].isspace():
            self.index += 1

    def _read_token(self) -> Token:
        self._skip_whitespace()
        if self.index >= self.length:
            return Token("eof", None, "")

        char = self.text[self.index]
        if self.text.startswith("...", self.index):
            self.index += 3
            return Token("punct", "...", "...")
        if char in "{}[]():,=+-.!":
            self.index += 1
            return Token("punct", char, char)

        if char in ("'", '"'):
            return self._read_string()

        if char.isdigit():
            return self._read_number()

        if char.isalpha() or char == "_" or char == "$":
            return self._read_identifier()

        raise ValueError(f"Unexpected character {char!r} at index {self.index}")

    def _read_string(self) -> Token:
        quote = self.text[self.index]
        self.index += 1
        value: list[str] = []
        escaped = False
        while self.index < self.length:
            char = self.text[self.index]
            self.index += 1
            if escaped:
                if char == "n":
                    value.append("\n")
                elif char == "r":
                    value.append("\r")
                elif char == "t":
                    value.append("\t")
                elif char == "x":
                    hex_value = self.text[self.index:self.index + 2]
                    self.index += 2
                    value.append(chr(int(hex_value, 16)))
                elif char == "u":
                    hex_value = self.text[self.index:self.index + 4]
                    self.index += 4
                    value.append(chr(int(hex_value, 16)))
                else:
                    value.append(char)
                escaped = False
                continue
            if char == "\\":
                escaped = True
                continue
            if char == quote:
                raw = self.text[:self.index]
                return Token("string", "".join(value), quote + "".join(value) + quote)
            value.append(char)
        raise ValueError("Unterminated string literal")

    def _read_number(self) -> Token:
        start = self.index
        if self.text.startswith("0x", self.index) or self.text.startswith("0X", self.index):
            self.index += 2
            while self.index < self.length and self.text[self.index].isalnum():
                self.index += 1
            raw = self.text[start:self.index]
            return Token("number", int(raw, 16), raw)
        while self.index < self.length and self.text[self.index].isdigit():
            self.index += 1
        raw = self.text[start:self.index]
        return Token("number", int(raw, 10), raw)

    def _read_identifier(self) -> Token:
        start = self.index
        while self.index < self.length:
            char = self.text[self.index]
            if char.isalnum() or char in ("_", "$"):
                self.index += 1
                continue
            break
        raw = self.text[start:self.index]
        return Token("identifier", raw, raw)


class ExpressionParser:
    def __init__(self, text: str, environment: dict[str, Any], strings: list[str]):
        self.tokens = TokenStream(text)
        self.environment = environment
        self.strings = strings

    def parse(self) -> Any:
        value = self.parse_additive()
        if self.tokens.peek().type != "eof":
            raise ValueError(f"Unexpected trailing token {self.tokens.peek().raw!r}")
        return value

    def parse_additive(self) -> Any:
        value = self.parse_unary()
        while self.tokens.peek().raw == "+":
            self.tokens.next()
            right = self.parse_unary()
            if isinstance(value, str) or isinstance(right, str):
                value = f"{value}{right}"
            else:
                value = value + right
        return value

    def parse_unary(self) -> Any:
        if self.tokens.peek().raw == "-":
            self.tokens.next()
            return -self.parse_unary()
        if self.tokens.peek().raw == "!":
            self.tokens.next()
            return not self.parse_unary()
        return self.parse_postfix()

    def parse_postfix(self) -> Any:
        value = self.parse_primary()
        while True:
            token = self.tokens.peek()
            if token.raw == ".":
                self.tokens.next()
                property_token = self.tokens.next()
                if property_token.type != "identifier":
                    raise ValueError("Expected property identifier")
                value = value[property_token.value]
                continue
            if token.raw == "[":
                self.tokens.next()
                key = self.parse_additive()
                self.tokens.expect("]")
                if isinstance(value, list):
                    if key == "length":
                        value = len(value)
                    else:
                        value = value[int(key)]
                else:
                    value = value[key]
                continue
            if token.raw == "(":
                args = self.parse_arguments()
                value = self.call_value(value, args)
                continue
            break
        return value

    def parse_arguments(self) -> list[Any]:
        arguments: list[Any] = []
        self.tokens.expect("(")
        if self.tokens.match(")"):
            return arguments
        while True:
            arguments.append(self.parse_additive())
            if self.tokens.match(")"):
                return arguments
            self.tokens.expect(",")

    def parse_primary(self) -> Any:
        token = self.tokens.next()
        if token.type == "number":
            return token.value
        if token.type == "string":
            return token.value
        if token.type == "identifier":
            if token.value == "null":
                return None
            if token.value == "true":
                return True
            if token.value == "false":
                return False
            if token.value in self.environment:
                return self.environment[token.value]
            return token.value
        if token.raw == "(":
            value = self.parse_additive()
            self.tokens.expect(")")
            return value
        if token.raw == "[":
            return self.parse_array()
        if token.raw == "{":
            return self.parse_object()
        raise ValueError(f"Unexpected token {token.raw!r}")

    def parse_array(self) -> list[Any]:
        values: list[Any] = []
        if self.tokens.match("]"):
            return values
        while True:
            if self.tokens.match("..."):
                spread_value = self.parse_additive()
                if not isinstance(spread_value, list):
                    raise ValueError("Array spread expects a list")
                values.extend(spread_value)
            else:
                values.append(self.parse_additive())
            if self.tokens.match("]"):
                return values
            self.tokens.expect(",")

    def parse_object(self) -> dict[str, Any]:
        result: dict[str, Any] = {}
        if self.tokens.match("}"):
            return result
        while True:
            if self.tokens.match("..."):
                spread_value = self.parse_additive()
                if not isinstance(spread_value, dict):
                    raise ValueError("Object spread expects a dict")
                result.update(spread_value)
                if self.tokens.match("}"):
                    return result
                self.tokens.expect(",")
                continue
            key_token = self.tokens.peek()
            if key_token.type == "string":
                key = self.tokens.next().value
            elif key_token.type == "identifier":
                key = self.tokens.next().value
            elif key_token.type == "number":
                key = str(self.tokens.next().value)
            elif key_token.raw == "[":
                self.tokens.next()
                key = self.parse_additive()
                self.tokens.expect("]")
            else:
                raise ValueError(f"Unsupported object key token {key_token.raw!r}")
            self.tokens.expect(":")
            result[str(key)] = self.parse_additive()
            if self.tokens.match("}"):
                return result
            self.tokens.expect(",")

    def call_value(self, value: Any, arguments: list[Any]) -> Any:
        if value == "a0_0x57fc":
            return decode_57fc(self.strings, int(arguments[0]))
        if value == "a0_0x118f84":
            return decode_118f84(self.strings, int(arguments[1]))
        if value == "a0_0x4ceda3":
            return decode_4ceda3(self.strings, int(arguments[1]))
        if value == "combineCounts":
            left = arguments[0]
            right = arguments[1]
            if not isinstance(left, dict) or not isinstance(right, dict):
                raise ValueError("combineCounts expects two objects")
            merged = dict(left)
            for key, count in right.items():
                merged[key] = (merged.get(key, 0) or 0) + count
            return merged
        raise ValueError(f"Unsupported call target {value!r}")


def evaluate_expression(text: str, environment: dict[str, Any], strings: list[str]) -> Any:
    return ExpressionParser(text, environment, strings).parse()


def assign_property(target: Any, key: Any, value: Any) -> None:
    if not isinstance(target, dict):
        raise ValueError("Only object property assignments are supported")
    target[key] = value


def process_declaration(statement: str, environment: dict[str, Any], strings: list[str]) -> None:
    keyword, remainder = statement.split(" ", 1)
    if keyword not in {"const", "let", "var"}:
        raise ValueError(f"Unsupported declaration keyword {keyword!r}")
    for declarator in split_top_level(remainder, ","):
        if not declarator:
            continue
        if "=" not in declarator:
            environment[declarator.strip()] = None
            continue
        name, expression = declarator.split("=", 1)
        environment[name.strip()] = evaluate_expression(expression.strip(), environment, strings)


def process_assignment(statement: str, environment: dict[str, Any], strings: list[str]) -> None:
    if "=" not in statement:
        return
    left, right = statement.split("=", 1)
    left = left.strip()
    value = evaluate_expression(right.strip(), environment, strings)
    if "[" in left and left.endswith("]"):
        target_name, key_expr = left.split("[", 1)
        key_expr = key_expr[:-1]
        target = environment[target_name.strip()]
        key = evaluate_expression(key_expr.strip(), environment, strings)
        assign_property(target, key, value)
        return
    environment[left] = value


def build_environment(source: str) -> dict[str, Any]:
    strings = load_decoded_strings()
    data_section = extract_data_section(source)
    statements = split_top_level_statements(data_section)
    environment: dict[str, Any] = {}
    for statement in statements:
        stripped = statement.strip()
        if not stripped or stripped.startswith("function "):
            continue
        try:
            if stripped.startswith(("const ", "let ", "var ")):
                process_declaration(stripped, environment, strings)
                continue
            for sub_statement in split_top_level(stripped, ","):
                if not sub_statement or sub_statement.startswith("function "):
                    continue
                process_assignment(sub_statement, environment, strings)
        except Exception:
            continue
    return environment


def extract_scenario_info_entries(
    source: str,
    environment: dict[str, Any],
    requested_keys: Iterable[str] | None = None,
) -> dict[str, Any]:
    strings = load_decoded_strings()
    requested = set(requested_keys) if requested_keys is not None else None
    statement = extract_statement(source, "const scenarioInfo")
    expression = statement.split("=", 1)[1].rsplit(";", 1)[0].strip()
    if not expression.startswith("{") or not expression.endswith("}"):
        raise RuntimeError("scenarioInfo is not an object literal")
    inner = expression[1:-1]
    entries: dict[str, Any] = {}
    for raw_entry in split_top_level(inner, ","):
        entry = raw_entry.strip()
        if not entry or entry.startswith("..."):
            continue
        key_expr, value_expr = split_key_value(entry)
        key = evaluate_expression(key_expr, environment, strings)
        if requested is not None and str(key) not in requested:
            continue
        entries[str(key)] = extract_object_fields(value_expr, environment, strings)
    return entries


def extract_object_fields(expression: str, environment: dict[str, Any], strings: list[str]) -> Any:
    stripped = expression.strip()
    if not stripped.startswith("{") or not stripped.endswith("}"):
        return evaluate_expression(stripped, environment, strings)

    result: dict[str, Any] = {}
    inner = stripped[1:-1]
    for raw_entry in split_top_level(inner, ","):
        entry = raw_entry.strip()
        if not entry or entry.startswith("..."):
            continue
        key_expr, value_expr = split_key_value(entry)
        try:
            key = evaluate_expression(key_expr, environment, strings)
        except Exception:
            continue
        try:
            result[str(key)] = evaluate_expression(value_expr, environment, strings)
        except Exception:
            if str(key) in {"hexPools", "hexHarborPools"}:
                try:
                    result[str(key)] = parse_pool_map_expression(value_expr, environment, strings)
                    continue
                except Exception:
                    pass
            continue
    return result


def parse_pool_map_expression(
    expression: str,
    environment: dict[str, Any],
    strings: list[str],
) -> dict[str, int]:
    stripped = expression.strip()
    if not stripped.startswith("{") or not stripped.endswith("}"):
        raise ValueError("Pool map is not an object literal")
    result: dict[str, int] = {}
    cursor = 0
    while True:
        spread_index = stripped.find("...[", cursor)
        if spread_index < 0:
            break
        array_start = spread_index + 3
        array_end = find_matching_delimiter(stripped, array_start, "[", "]")
        array_expression = stripped[array_start:array_end + 1]
        indices = evaluate_expression(array_expression, environment, strings)
        pool_match = re.search(r"\]\s*:\s*(0x[0-9a-fA-F]+|\d+)", stripped[array_end + 1:])
        if not pool_match:
            raise ValueError("Pool index not found")
        pool_value = int(pool_match.group(1), 16 if pool_match.group(1).startswith("0x") else 10)
        for index in indices:
            result[str(index)] = pool_value
        cursor = array_end + 1
    if not result:
        raise ValueError("No pool entries parsed")
    return result


def find_matching_delimiter(text: str, start: int, open_char: str, close_char: str) -> int:
    depth = 0
    quote = ""
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = ""
            continue
        if char in ("'", '"'):
            quote = char
            continue
        if char == open_char:
            depth += 1
            continue
        if char == close_char:
            depth -= 1
            if depth == 0:
                return index
    raise ValueError(f"Unclosed delimiter {open_char!r}")


def normalize_resource_name(value: str) -> str:
    return {
        "field": "grain",
        "forest": "lumber",
        "hill": "brick",
        "mountain": "ore",
        "moutain": "ore",
        "pasture": "wool",
        "sea": "sea",
        "desert": "desert",
        "goldfield": "gold",
        "gold": "gold",
    }.get(value, value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--object", dest="object_name")
    parser.add_argument("--scenario", dest="scenario_id")
    parser.add_argument("--summary", action="store_true")
    return parser.parse_args()


def main() -> None:
    arguments = parse_args()
    source = GENERATOR_PATH.read_text(encoding="utf-8")
    environment = build_environment(source)

    if arguments.summary:
        scenario_info = extract_scenario_info_entries(source, environment, OFFICIAL_SCENARIO_KEYS)
        map_info = environment["mapInfo"]
        print(json.dumps(
            {
                "scenarioCount": len(scenario_info),
                "mapClasses": sorted(map_info.keys()),
            },
            indent=2,
            ensure_ascii=False,
        ))
        return

    if arguments.object_name:
        print(json.dumps(environment[arguments.object_name], indent=2, ensure_ascii=False))
        return

    if arguments.scenario_id:
        scenario_info = extract_scenario_info_entries(source, environment, [arguments.scenario_id])
        print(json.dumps(scenario_info[arguments.scenario_id], indent=2, ensure_ascii=False))
        return

    raise SystemExit("Specify --summary, --object or --scenario.")


if __name__ == "__main__":
    main()
