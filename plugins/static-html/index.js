// @ts-check
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
  const existing = path.join("quartz", "static", file)
  if (await exists(existing)) {
    throw new Error(`Cannot publish ${file}: ${existing} already exists`)
  }
  return path.join(ctx.argv.output, "static", file)
}

/**
 * @param {import("../../quartz/util/ctx").BuildCtx} ctx
 * @param {string} file
 */
async function copy(ctx, file) {
  const output = await destination(ctx, file)
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.copyFile(path.join(ctx.argv.directory, file), output)
  return /** @type {import("../../quartz/util/path").FilePath} */ (output)
}

/** @returns {import("../../quartz/plugins/types").QuartzEmitterPluginInstance} */
export default function StaticHtml() {
  return {
    name: "StaticHtml",
    async *emit(ctx) {
      const files = await globby("**/*.[hH][tT][mM][lL]", {
        cwd: ctx.argv.directory,
        ignore: ctx.cfg.configuration.ignorePatterns,
        gitignore: true,
      })
      for (const file of files) yield copy(ctx, file)
    },
    async *partialEmit(ctx, _content, _resources, changes) {
      for (const change of changes) {
        if (path.extname(change.path).toLowerCase() !== ".html") continue
        if (change.type === "delete") {
          await fs.unlink(await destination(ctx, change.path))
        } else {
          yield copy(ctx, change.path)
        }
      }
    },
  }
}
