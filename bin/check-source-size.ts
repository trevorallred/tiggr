import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const fileLimit = 300
const functionLimit = 50
const complexityLimit = 12
const depthLimit = 3
const extensions = /\.(?:[cm]?[jt]sx?)$/
const excludedDirectories = new Set(['.git', 'build', 'coverage', 'dist', 'node_modules'])
const complexityNodes = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.CaseClause,
])
const logicalOperators = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
])
const nestingNodes = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.SwitchStatement,
  ts.SyntaxKind.TryStatement,
])

type FunctionMetric = 'complexity' | 'depth' | 'function'
type Violation = { file: string; line: number; kind: 'file' | FunctionMetric; name?: string; value: number }

const sourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const descendants = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return excludedDirectories.has(entry.name) ? [] : sourceFiles(entryPath)
      return extensions.test(entry.name) ? [entryPath] : []
    })
  )
  return descendants.flat()
}

const codeLines = (contents: string): boolean[] => {
  const withoutComments = contents.split('')
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, contents)
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue
    for (let index = scanner.getTokenPos(); index < scanner.getTextPos(); index += 1) {
      if (withoutComments[index] !== '\n' && withoutComments[index] !== '\r') withoutComments[index] = ' '
    }
  }
  return withoutComments.join('').split(/\r?\n/).map((line) => line.trim().length > 0)
}

const functionName = (node: ts.FunctionLikeDeclaration): string => {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text
  if (ts.isConstructorDeclaration(node)) return 'constructor'
  const parent = node.parent
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) return parent.name.text
  return 'callback'
}

const isNestedFunction = (node: ts.Node, root: ts.FunctionLikeDeclaration): boolean =>
  node !== root && ts.isFunctionLike(node)

const addsComplexity = (node: ts.Node): boolean => {
  if (complexityNodes.has(node.kind)) return true
  if (ts.isBinaryExpression(node)) return logicalOperators.has(node.operatorToken.kind)
  if (ts.isParameter(node) || ts.isBindingElement(node)) return node.initializer !== undefined
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isCallExpression(node)) {
    return node.questionDotToken !== undefined
  }
  return false
}

const nestingIncrement = (node: ts.Node): number => {
  if (ts.isIfStatement(node) && ts.isIfStatement(node.parent) && node.parent.elseStatement === node) return 0
  return nestingNodes.has(node.kind) ? 1 : 0
}

const complexityOf = (root: ts.FunctionLikeDeclaration): number => {
  let complexity = 1
  const visit = (node: ts.Node) => {
    if (isNestedFunction(node, root)) return
    if (addsComplexity(node)) complexity += 1
    ts.forEachChild(node, visit)
  }
  visit(root)
  return complexity
}

const depthOf = (root: ts.FunctionLikeDeclaration): number => {
  let maximum = 0
  const visit = (node: ts.Node, depth: number) => {
    if (isNestedFunction(node, root)) return
    const nextDepth = depth + nestingIncrement(node)
    maximum = Math.max(maximum, nextDepth)
    ts.forEachChild(node, (child) => visit(child, nextDepth))
  }
  visit(root, 0)
  return maximum
}

const reportFunctions = (source: ts.SourceFile, file: string, lines: boolean[], violations: Violation[]) => {
  const visit = (node: ts.Node) => {
    if (ts.isFunctionLike(node) && node.body) {
      const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line
      const end = source.getLineAndCharacterOfPosition(node.getEnd()).line
      const metrics: Array<[FunctionMetric, number, number]> = [
        ['function', lines.slice(start, end + 1).filter(Boolean).length, functionLimit],
        ['complexity', complexityOf(node), complexityLimit],
        ['depth', depthOf(node), depthLimit],
      ]
      for (const [kind, value, limit] of metrics) {
        if (value > limit) violations.push({ file, line: start + 1, kind, name: functionName(node), value })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

const describe = ({ kind, name, value }: Violation): string => {
  if (kind === 'file') return `file has ${value} code lines (max ${fileLimit})`
  if (kind === 'function') return `${name} function has ${value} code lines (max ${functionLimit})`
  if (kind === 'complexity') return `${name} function has complexity ${value} (max ${complexityLimit})`
  return `${name} function has nesting depth ${value} (max ${depthLimit})`
}

const main = async () => {
  const violations: Violation[] = []
  for (const file of await sourceFiles('.')) {
    const contents = await readFile(file, 'utf8')
    const lines = codeLines(contents)
    const count = lines.filter(Boolean).length
    if (count > fileLimit) violations.push({ file, line: 1, kind: 'file', value: count })
    const source = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, true)
    reportFunctions(source, file, lines, violations)
  }
  for (const violation of violations) console.error(`${violation.file}:${violation.line}: ${describe(violation)}`)
  if (violations.length > 0) process.exitCode = 1
}

void main()
