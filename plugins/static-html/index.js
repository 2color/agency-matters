// @ts-check
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import * as fs from "node:fs/promises"
import path from "node:path"
import { globby } from "globby"

/** @param {string} file */
async function exists(file) {
  try {
    await fs.access(file, constants.F_OK)
    return true
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") return false
    throw error
  }
}

/**
 * @param {import("../../quartz/util/ctx").BuildCtx} ctx
 * @param {string} file
 */
async function destination(ctx, file) {
  const parts = file.split("/")
  if (parts[0] === "static") {
    const existing = path.join("quartz", ...parts)
    if (await exists(existing)) {
      throw new Error(`Cannot publish ${file}: ${existing} already exists`)
    }
  }
  return path.join(ctx.argv.output, file)
}

/**
 * @param {import("../../quartz/util/ctx").BuildCtx} ctx
 * @param {string} file
 * @param {Map<string, string>} published
 */
async function copy(ctx, file, published) {
  const output = await destination(ctx, file)
  await fs.mkdir(path.dirname(output), { recursive: true })
  if (published.has(file)) {
    await verifyOwned(output, file, published)
  } else if (await exists(output)) {
    throw new Error(`Cannot publish ${file}: ${output} already exists`)
  }
  const contents = await fs.readFile(path.join(ctx.argv.directory, file))
  await fs.writeFile(output, contents, { flag: published.has(file) ? "w" : "wx" })
  published.set(file, digest(contents))
  return /** @type {import("../../quartz/util/path").FilePath} */ (output)
}

/** @param {Buffer} contents */
function digest(contents) {
  return createHash("sha256").update(contents).digest("hex")
}

/**
 * @param {string} output
 * @param {string} file
 * @param {Map<string, string>} published
 */
async function verifyOwned(output, file, published) {
  if (!(await exists(output)) || digest(await fs.readFile(output)) !== published.get(file)) {
    throw new Error(`Cannot update ${file}: ${output} was changed by another emitter`)
  }
}

/** @returns {import("../../quartz/plugins/types").QuartzEmitterPluginInstance} */
export default function StaticHtml() {
  /** @type {Map<string, string>} */
  const published = new Map()
  return {
    name: "StaticHtml",
    async *emit(ctx) {
      const files = await globby("**/*.[hH][tT][mM][lL]", {
        cwd: ctx.argv.directory,
        ignore: ctx.cfg.configuration.ignorePatterns,
        gitignore: true,
      })
      for (const file of files) yield copy(ctx, file, published)
    },
    async *partialEmit(ctx, _content, _resources, changes) {
      for (const file of published.keys()) {
        await verifyOwned(await destination(ctx, file), file, published)
      }
      for (const change of changes) {
        if (path.extname(change.path).toLowerCase() !== ".html") continue
        if (change.type === "delete") {
          if (!published.has(change.path)) continue
          await fs.unlink(await destination(ctx, change.path))
          published.delete(change.path)
        } else {
          yield copy(ctx, change.path, published)
        }
      }
    },
  }
}
