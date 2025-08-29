import { Router } from "express";
import * as esprima from "esprima";
import {
  checkJavaScript,
  checkPython,
  checkCOrCpp,
  checkJava,
} from "../lib/codeCheckers";

const router = Router();

async function runCode(
  language: string,
  files?: Record<string, string>,
  entry?: string,
  code?: string
): Promise<{ stdout: string; stderr: string }> {
  const pistonLangs: Record<string, { language: string; version: string }> = {
    python: { language: "python", version: "3.10.0" },
    javascript: { language: "javascript", version: "18.15.0" },
    node: { language: "javascript", version: "18.15.0" },
    c: { language: "c", version: "10.2.0" },
    cpp: { language: "cpp", version: "10.2.0" },
    java: { language: "java", version: "15.0.2" },
  };

  const pistonLang = pistonLangs[language];
  if (!pistonLang) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const mainCode = code || (entry && files?.[entry]) || "";
  const pistonFiles = files
    ? Object.entries(files).map(([name, content]) => ({ name, content }))
    : [{ name: entry || "main", content: mainCode }];

  const res = await fetch("https://emkc.org/api/v2/piston/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language: pistonLang.language,
      version: pistonLang.version,
      files: pistonFiles,
    }),
  });

  if (!res.ok) {
    throw new Error(`Piston API request failed with status ${res.status}`);
  }

  const result = await res.json();

  return {
    stdout: result.run.stdout || "",
    stderr: result.run.stderr || "",
  };
}

router.post("/", async (req, res) => {
  try {
    const { language, code, entry, files, mode } = req.body;

    if (!language || (!code && (!entry || !files))) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const codeToCheck = code || (entry && files?.[entry]) || "";
    let checkResult;

    switch (language) {
      case "javascript":
      case "node":
        checkResult = checkJavaScript(codeToCheck, mode);
        break;
      case "python":
        checkResult = checkPython(codeToCheck);
        break;
      case "c":
      case "cpp":
        checkResult = checkCOrCpp(codeToCheck);
        break;
      case "java":
        checkResult = checkJava(codeToCheck);
        break;
      default:
        return res
          .status(400)
          .json({ error: `Unsupported language: ${language}` });
    }

    if (!checkResult.ok) {
      return res
        .status(400)
        .json({ error: "Code validation failed", issues: checkResult.issues });
    }

    if (
      (language === "javascript" || language === "node") &&
      mode === "preview"
    ) {
      const dependencies: Record<string, string> = {};
      const visited = new Set<string>();
      let bundle = "";

      function extractDependencies(jsCode: string) {
        const deps = new Set<string>();
        try {
          const ast = esprima.parseModule(jsCode, {
            tolerant: true,
            jsx: true,
          });
          for (const node of ast.body) {
            if (
              node.type === "ImportDeclaration" &&
              typeof node.source?.value === "string"
            ) {
              const source = node.source.value;
              if (!source.startsWith(".") && !source.startsWith("/")) {
                deps.add(source);
              }
            }
          }
        } catch (err) {
          console.warn("Dependency parsing error:", err);
        }
        return Array.from(deps);
      }

      function resolve(fileName: string) {
        if (!files[fileName] || visited.has(fileName)) return;
        visited.add(fileName);

        const content = files[fileName];
        const deps = extractDependencies(content);
        for (const dep of deps) {
          dependencies[dep] = "latest";
        }

        const importRegex = /import\s+(?:.+?\s+from\s+)?['"](.+?)['"]/g;
        let match;
        while ((match = importRegex.exec(content))) {
          let imported = match[1];
          if (!imported.startsWith(".") && !imported.startsWith("/")) continue;
          if (!imported.endsWith(".js")) imported += ".js";
          resolve(imported);
        }

        bundle += `\n// FILE: ${fileName}\n${content}\n`;
      }

      if (files && entry && files[entry]) {
        resolve(entry);
      }

      return res.json({
        output: "Dependency analysis completed in preview mode.",
        packageJson: {
          name: "live-preview-project",
          version: "1.0.0",
          dependencies,
        },
      });
    }

    const result = await runCode(language, files, entry, code);

    const stdout = result.stdout.trim();
    const stderr = result.stderr.trim();
    const output =
      !stdout && !stderr ? "Program ran successfully with no output." : stdout;

    return res.json({ stdout: output, stderr });
  } catch (err: any) {
    console.error("Execution error:", err);
    return res.status(500).json({ error: err.message || "Execution failed" });
  }
});

export default router;
