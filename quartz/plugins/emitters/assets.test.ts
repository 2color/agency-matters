import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { BuildCtx } from "../../util/ctx"
import { FilePath } from "../../util/path"
import { StaticResources } from "../../util/resources"
import { Assets } from "./assets"

test("publishes content HTML under static and keeps it updated", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "quartz-assets-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = path.join(root, "content")
  const output = path.join(root, "public")
  await mkdir(path.join(directory, "nested folder"), { recursive: true })
  await mkdir(path.join(directory, "private"), { recursive: true })
  await writeFile(path.join(directory, "nested folder", "page.html"), "<h1>Original</h1>")
  await writeFile(path.join(directory, "private", "secret.html"), "private")
  await writeFile(path.join(directory, "image.png"), "image")

  const ctx: BuildCtx = {
    buildId: "test",
    argv: { directory, output, verbose: false, serve: false, watch: false, port: 0, wsPort: 0 },
    cfg: {
      configuration: { ignorePatterns: ["private"] } as BuildCtx["cfg"]["configuration"],
      plugins: { pageTypes: [], transformers: [], filters: [], emitters: [] },
    },
    allSlugs: [],
    allFiles: [],
    incremental: false,
    virtualPages: [],
  }
  const resources: StaticResources = { css: [], js: [], additionalHead: [] }
  const emitter = Assets()
  for await (const _ of await emitter.emit(ctx, [], resources)) {
    // Consume the emitter.
  }

  const published = path.join(output, "static", "nested folder", "page.html")
  assert.equal(await readFile(published, "utf8"), "<h1>Original</h1>")
  await assert.rejects(readFile(path.join(output, "static", "private", "secret.html")), {
    code: "ENOENT",
  })
  assert.equal(await readFile(path.join(output, "image.png"), "utf8"), "image")
  await assert.rejects(readFile(path.join(output, "static", "image.png")), { code: "ENOENT" })

  const relativePath = "nested folder/page.html" as FilePath
  await writeFile(path.join(directory, relativePath), "<h1>Updated</h1>")
  for await (const _ of await emitter.partialEmit!(ctx, [], resources, [
    { type: "change", path: relativePath },
  ])!) {
    // Consume the emitter.
  }
  assert.equal(await readFile(published, "utf8"), "<h1>Updated</h1>")

  await rm(path.join(directory, relativePath))
  for await (const _ of await emitter.partialEmit!(ctx, [], resources, [
    { type: "delete", path: relativePath },
  ])!) {
    // Consume the emitter.
  }
  await assert.rejects(readFile(published), { code: "ENOENT" })
})
