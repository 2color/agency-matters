import assert from "node:assert/strict"
import * as fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import StaticHtml from "./index.js"

test("publishes HTML files while respecting ignores and watch changes", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quartz-static-html-"))
  const previous = process.cwd()
  process.chdir(root)
  t.after(async () => {
    process.chdir(previous)
    await fs.rm(root, { recursive: true, force: true })
  })
  const directory = path.join(root, "content")
  const output = path.join(root, "public")
  await fs.mkdir(path.join(directory, "nested folder"), { recursive: true })
  await fs.mkdir(path.join(directory, "private"), { recursive: true })
  await fs.writeFile(path.join(directory, "nested folder", "page.html"), "<h1>Original</h1>")
  await fs.writeFile(path.join(directory, "top.HTML"), "top")
  await fs.writeFile(path.join(directory, "private", "secret.html"), "private")
  await fs.writeFile(path.join(directory, "image.png"), "image")

  const ctx = {
    argv: { directory, output },
    cfg: { configuration: { ignorePatterns: ["private"] } },
  }
  const emitter = StaticHtml()
  for await (const _ of emitter.emit(ctx, [], {})) {
  }
  const published = path.join(output, "static", "nested folder", "page.html")
  assert.equal(await fs.readFile(published, "utf8"), "<h1>Original</h1>")
  assert.equal(await fs.readFile(path.join(output, "static", "top.HTML"), "utf8"), "top")
  await assert.rejects(fs.access(path.join(output, "static", "private", "secret.html")))
  await assert.rejects(fs.access(path.join(output, "static", "image.png")))

  const file = "nested folder/page.html"
  await fs.writeFile(path.join(directory, file), "<h1>Updated</h1>")
  for await (const _ of emitter.partialEmit(ctx, [], {}, [{ type: "change", path: file }])) {
  }
  assert.equal(await fs.readFile(published, "utf8"), "<h1>Updated</h1>")
  await fs.unlink(path.join(directory, file))
  for await (const _ of emitter.partialEmit(ctx, [], {}, [{ type: "delete", path: file }])) {
  }
  await assert.rejects(fs.access(published))

  await fs.mkdir(path.join(root, "quartz", "static"), { recursive: true })
  await fs.writeFile(path.join(root, "quartz", "static", "top.HTML"), "existing")
  await assert.rejects(async () => {
    for await (const _ of emitter.emit(ctx, [], {})) {
    }
  }, /Cannot publish top\.HTML/)
})
