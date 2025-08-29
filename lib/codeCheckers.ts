import * as esprima from "esprima";

export type CodeCheckResult = {
  ok: boolean;
  issues: string[];
};

function makeCheckResult(issues: string[]): CodeCheckResult {
  return { ok: issues.length === 0, issues };
}

// JavaScript / Node
export function checkJavaScript(
  code: string,
  mode: "preview" | "execute" = "execute"
): CodeCheckResult {
  const issues: string[] = [];

  try {
    const tokens = esprima.tokenize(code);
    const dangerousIdentifiers = [
      "require",
      "process",
      "eval",
      "Function",
      "global",
      "globalThis",
      "child_process",
      "fs",
      "os",
    ];

    // Only flag browser APIs during server-side execution
    const browserAPIs =
      mode === "execute"
        ? ["window", "document", "HTMLElement", "navigator"]
        : [];

    for (const token of tokens) {
      if (token.type === "Identifier") {
        if (dangerousIdentifiers.includes(token.value)) {
          issues.push(`Use of dangerous identifier: ${token.value}`);
        }
        if (browserAPIs.includes(token.value)) {
          issues.push(`Use of browser-specific API: ${token.value}`);
        }
      }
    }
  } catch (err: any) {
    issues.push(`Syntax error: ${err.message}`);
  }

  return makeCheckResult(issues);
}

// Python
export function checkPython(code: string): CodeCheckResult {
  const issues: string[] = [];
  const patterns = [
    /import\s+(os|sys|subprocess|socket|shlex)/,
    /from\s+(os|sys|subprocess)\s+import/,
    /\b(eval|exec|open|input|__import__)\s*\(/,
  ];

  for (const pattern of patterns) {
    const match = code.match(pattern);
    if (match) {
      issues.push(`Use of dangerous Python pattern: ${match[0]}`);
    }
  }

  return makeCheckResult(issues);
}

// C / C++
export function checkCOrCpp(code: string): CodeCheckResult {
  const issues: string[] = [];

  const includes = [
    "#include <unistd.h>",
    "#include <sys/types.h>",
    "#include <sys/socket.h>",
    "#include <fcntl.h>",
  ];

  const patterns = [/\b(system|exec|fork|popen|socket|open)\s*\(/];

  for (const inc of includes) {
    if (code.includes(inc)) {
      issues.push(`Dangerous include: ${inc}`);
    }
  }

  for (const pattern of patterns) {
    const match = code.match(pattern);
    if (match) {
      issues.push(`Use of dangerous function: ${match[0]}`);
    }
  }

  return makeCheckResult(issues);
}

// Java
export function checkJava(code: string): CodeCheckResult {
  const issues: string[] = [];

  const patterns = [
    /import\s+java\.io\./,
    /import\s+java\.net\./,
    /import\s+java\.lang\.reflect\./,
    /\b(Runtime\.getRuntime\(\)|System\.exit|ProcessBuilder|new\s+FileInputStream)/,
  ];

  for (const pattern of patterns) {
    const match = code.match(pattern);
    if (match) {
      issues.push(`Use of dangerous Java code: ${match[0]}`);
    }
  }

  return makeCheckResult(issues);
}
