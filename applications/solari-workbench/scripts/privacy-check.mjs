import { execFileSync } from "node:child_process";
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const prefix = execFileSync("git", ["rev-parse", "--show-prefix"], {
  encoding: "utf8",
}).trim();
const git = (args, options) =>
  execFileSync("git", ["-C", root, ...args], options);
const files = git(["ls-files", "-z", "--", prefix || "."], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const rules = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  [
    "GitHub token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  ],
  ["API credential", /\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/],
  ["embedded URL credentials", /https?:\/\/[^\s/@:]+:[^\s/@]+@/],
  ["personal absolute path", /\/(?:Users|home)\/[A-Za-z0-9._-]+\//],
  [
    "private network address",
    /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/,
  ],
  ["conversation identifier", /codex:\/\/threads\//],
  [
    "sensitive filename",
      /(?:^|\/)(?:\.env(?:\.(?!example$)|$)|hosts\.yml$|service\.json$|auth\.json$|credentials(?:\.json)?$|[^/]+\.(?:sqlite|pem|key)$)/,
  ],
];
const findings = new Set();
const seen = new Set();
function inspect(path, data) {
  if (data.includes(0)) {
    findings.add(`${path}: binary requires manual review`);
    return;
  }
  const text = data.toString("utf8");
  for (const [label, pattern] of rules)
    if (pattern.test(label === "sensitive filename" ? path : text))
      findings.add(`${path}: ${label}`);
  const emails = [
    ...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
  ].map((m) => m[0]);
  if (
    emails.some(
      (x) =>
        !x.endsWith("@example.invalid") &&
        !x.endsWith("@users.noreply.github.com"),
    )
  )
    findings.add(`${path}: email requires review`);
}
for (const path of files) {
  const entry = git(["ls-files", "--stage", "--", path], {
    encoding: "utf8",
  });
  if (!/^(100644|100755) /.test(entry)) {
    findings.add(`${path}: non-regular tracked file`);
    continue;
  }
  inspect(
    path,
    git(["show", `:${path}`], { maxBuffer: 20 * 1024 * 1024 }),
  );
}
let commits = 0;
if (process.argv.includes("--history")) {
  const revisions = git(["rev-list", "HEAD", "--", prefix || "."], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  commits = revisions.length;
  for (const revision of revisions) {
    inspect(
      `commit ${revision.slice(0, 12)} metadata`,
      git([
        "show",
        "-s",
        "--format=%an <%ae>%n%cn <%ce>%n%B",
        revision,
      ]),
    );
    for (const entry of git(["ls-tree", "-rz", revision, "--", prefix || "."], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    })
      .split("\0")
      .filter(Boolean)) {
      const split = entry.indexOf("\t");
      const [mode, type, blob] = entry.slice(0, split).split(" ");
      const path = entry.slice(split + 1);
      if (!["100644", "100755"].includes(mode) || type !== "blob") {
        findings.add(`${path}: non-regular historical file`);
        continue;
      }
      const key = blob + ":" + path;
      if (seen.has(key)) continue;
      seen.add(key);
      inspect(
        path,
        git(["cat-file", "blob", blob], {
          maxBuffer: 20 * 1024 * 1024,
        }),
      );
    }
  }
}
if (findings.size) {
  console.error([...findings].join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Reviewed ${files.length} staged text files${commits ? ` and ${commits} commits (${seen.size} distinct file versions)` : ""}: no matching secrets or personal metadata. Content review is still required before sharing evidence.`,
  );
