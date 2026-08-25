import {
  resource,
  test,
  type JsonValue,
  type SuiteDefinition,
  type TestContext,
} from 'tiggr'

type Config = { baseUrl: string }
type Project = { id: string; name: string; archived: boolean }
type Document = { id: string; projectId: string; content: string; status: string }
type Summary = { documentId: string; summary: string }
type Tags = { documentId: string; tags: string[] }
type SearchOutput = {
  primaryProjectId: string
  primaryDocumentId: string
  foreignProjectId: string
  foreignDocumentId: string
  primaryResults: Document[]
  summary: string
  tags: string[]
}

const project = resource<Config, Project, Project>({
  id: 'project',
  create: test({
    id: 'createProject',
    intent: 'Create the singleton project used by the sample suite',
    tags: ['project', 'smoke'],
    provenance: { origin: 'sample-app' },
    run: (context) => request<Project>(context, 'POST', '/projects', { name: 'Tiggr sample' }, 201),
    verify: (context, output) => assertObserved(context, 'a project id', output.id, output.id.length > 0),
  }),
  destroy: test({
    id: 'archiveProject',
    intent: 'Archive the suite project after its full dependent tree finishes',
    run: (context) => {
      const created = requiredOutput<Project>(context, 'createProject')
      return request<Project>(context, 'POST', `/projects/${created.id}/archive`, undefined, 200)
    },
    verify: (context, output) => assertObserved(context, true, output.archived, output.archived),
  }),
})

const definitions: SuiteDefinition<Config>[] = [
  project,
  test<Config, Document>({
    id: 'createDocument',
    intent: 'Create a searchable document inside the suite project',
    uses: ['project'],
    run: (context) => {
      const created = requiredOutput<Project>(context, 'createProject')
      return request<Document>(
        context,
        'POST',
        `/projects/${created.id}/documents`,
        { content: 'Honeycomb search belongs only to its Tiggr project.' },
        201
      )
    },
  }),
  test<Config, Document>({
    id: 'processDocument',
    intent: 'Queue asynchronous processing across a real HTTP boundary',
    dependsOn: ['createDocument'],
    uses: ['project'],
    run: (context) => {
      const document = requiredOutput<Document>(context, 'createDocument')
      return request<Document>(context, 'POST', `/documents/${document.id}/process`, undefined, 202)
    },
    verify: (context, output) => {
      assertObserved(context, 'processing', output.status, output.status === 'processing')
    },
  }),
  test<Config, Summary>({
    id: 'summarize',
    intent: 'Wait for processing and create one independent downstream artifact',
    dependsOn: ['processDocument'],
    run: async (context) => {
      const document = requiredOutput<Document>(context, 'createDocument')
      await waitForProcessing(context, document.id)
      return request<Summary>(context, 'POST', `/documents/${document.id}/summary`, undefined, 201)
    },
  }),
  test<Config, Tags>({
    id: 'tag',
    intent: 'Wait for processing and create the other independent downstream artifact',
    dependsOn: ['processDocument'],
    run: async (context) => {
      const document = requiredOutput<Document>(context, 'createDocument')
      await waitForProcessing(context, document.id)
      return request<Tags>(context, 'POST', `/documents/${document.id}/tags`, undefined, 201)
    },
  }),
  test<Config, SearchOutput>({
    id: 'search',
    intent: 'Fan in summary and tags while proving project search isolation',
    invariants: ["A project's documents are never returned by another project's search"],
    dependsOn: ['summarize', 'tag'],
    uses: ['project'],
    tags: ['search', 'invariant'],
    provenance: {
      origin: 'sample-app',
      reasoning: 'Demonstrate a real tenant-isolation-style invariant without external data',
    },
    run: async (context) => {
      const primaryProject = requiredOutput<Project>(context, 'createProject')
      const primaryDocument = requiredOutput<Document>(context, 'createDocument')
      const summary = requiredOutput<Summary>(context, 'summarize')
      const tags = requiredOutput<Tags>(context, 'tag')
      const foreignProject = await request<Project>(context, 'POST', '/projects', { name: 'Isolation control' }, 201)
      const foreignDocument = await request<Document>(
        context,
        'POST',
        `/projects/${foreignProject.id}/documents`,
        { content: 'Honeycomb must remain isolated in this other project.' },
        201
      )
      const search = await request<{ documents: Document[] }>(
        context,
        'GET',
        `/projects/${primaryProject.id}/search?q=honeycomb`,
        undefined,
        200
      )
      return {
        primaryProjectId: primaryProject.id,
        primaryDocumentId: primaryDocument.id,
        foreignProjectId: foreignProject.id,
        foreignDocumentId: foreignDocument.id,
        primaryResults: search.documents,
        summary: summary.summary,
        tags: tags.tags,
      }
    },
    verify: (context, output) => {
      const resultIds = output.primaryResults.map(({ id }) => id)
      const isolated = output.primaryResults.every(({ projectId }) => projectId === output.primaryProjectId)
        && resultIds.includes(output.primaryDocumentId)
        && !resultIds.includes(output.foreignDocumentId)
      assertObserved(context, `only documents from ${output.primaryProjectId}`, output.primaryResults, isolated)
      assertObserved(context, 'summary consumed at fan-in', output.summary, output.summary.includes('Honeycomb'))
      assertObserved(context, 'tags consumed at fan-in', output.tags, output.tags.includes('honeycomb'))
      if (!isolated) throw new Error('Search returned a document from another project')
    },
  }),
]

async function waitForProcessing(context: TestContext<Config>, documentId: string): Promise<void> {
  let attempts = 0
  let settled = false
  while (attempts < 40) {
    attempts++
    const document = await request<Document>(context, 'GET', `/documents/${documentId}`, undefined, 200)
    if (document.status === 'processed') {
      settled = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  context.observe({ type: 'poll', attempts, settled, target: `document:${documentId}:processed` })
  if (!settled) throw new Error(`Document ${documentId} did not finish processing`)
}

async function request<Output>(
  context: TestContext<Config>,
  method: string,
  path: string,
  body: object | undefined,
  expectedStatus: number
): Promise<Output> {
  const response = await fetch(`${context.config.baseUrl}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  context.observe({ type: 'http', method, path, status: response.status })
  const parsed = (await response.json()) as Output
  if (response.status !== expectedStatus) throw new Error(`${method} ${path} returned ${response.status}`)
  return parsed
}

function requiredOutput<Output>(context: TestContext<Config>, id: string): Output {
  const output = context.outputs.get<Output>(id)
  if (output === undefined) throw new Error(`Required output ${id} was unavailable`)
  return output
}

function assertObserved(
  context: TestContext<Config>,
  expected: JsonValue,
  actual: JsonValue,
  passed: boolean
): void {
  context.observe({ type: 'assertion', expected, actual, passed })
  if (!passed) throw new Error(`Assertion failed: expected ${JSON.stringify(expected)}`)
}

export default {
  definitions,
  config: { baseUrl: process.env.TIGGR_BASE_URL ?? 'http://127.0.0.1:3000' },
  metadata: { suite: 'sample-app' },
}
