var fso = new ActiveXObject("Scripting.FileSystemObject");
var inputPath = WScript.Arguments.length > 0
  ? WScript.Arguments(0)
  : "references\\seafarers\\generator-main.js";

function readText(path) {
  var stream = fso.OpenTextFile(path, 1, false);
  try {
    return stream.ReadAll();
  } finally {
    stream.Close();
  }
}

function extractFunction(text, name) {
  var marker = "function " + name;
  var start = text.indexOf(marker);
  if (start < 0) {
    throw new Error("Function not found: " + name);
  }
  var brace = text.indexOf("{", start);
  var depth = 0;
  var i;
  var quote = "";
  var escaped = false;
  for (i = brace; i < text.length; i += 1) {
    var ch = text.charAt(i);
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === "\"" || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.substring(start, i + 1);
      }
    }
  }
  throw new Error("Unclosed function: " + name);
}

function extractInitialIife(text) {
  var start = text.indexOf("(function");
  if (start < 0) {
    throw new Error("Initial IIFE not found");
  }
  var depth = 0;
  var quote = "";
  var escaped = false;
  var i;
  for (i = start; i < text.length; i += 1) {
    var ch = text.charAt(i);
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === "\"" || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        if (text.charAt(i + 1) === ";") {
          return text.substring(start, i + 2);
        }
        return text.substring(start, i + 1);
      }
    }
  }
  throw new Error("Initial IIFE not closed");
}

function toJScript(source) {
  return source
    .replace(/\bconst\b/g, "var")
    .replace(/\blet\b/g, "var");
}

var source = readText(inputPath);
var outputPath = "references\\seafarers\\decoded_strings.tsv";
var runtimeSource = [
  toJScript(extractInitialIife(source)),
  toJScript(extractFunction(source, "a0_0x194c")),
  toJScript(extractFunction(source, "a0_0x57fc")),
  toJScript(extractFunction(source, "a0_0x118f84")),
  toJScript(extractFunction(source, "a0_0x4ceda3"))
].join("\n");

try {
  eval(runtimeSource);
} catch (error) {
  WScript.Echo("eval_failed=" + error.message);
  WScript.Echo(runtimeSource.substring(0, 400));
  WScript.Quit(1);
}

WScript.Echo("arr0=" + a0_0x194c()[0]);
WScript.Echo("arr1=" + a0_0x194c()[1]);
WScript.Echo("resourcesKey=" + a0_0x118f84(0x615, 0x53c, 0x64b, 0x6fc));
WScript.Echo("portsKey=" + a0_0x4ceda3(0x34a, 0x46c, 0x604, 0x32d));

var out = fso.CreateTextFile(outputPath, true);
try {
  var entries = a0_0x194c();
  var i;
  for (i = 0; i < entries.length; i += 1) {
    out.WriteLine(i + "\t" + a0_0x57fc(i + 0xb7, 0));
  }
} finally {
  out.Close();
}
WScript.Echo("decodedPath=" + outputPath);
