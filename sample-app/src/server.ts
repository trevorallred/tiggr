import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { pathToFileURL } from 'node:url'

type Project = { id: string; name: string; archived: boolean }
type DocumentStatus = 'created' | 'processing' | 'processed'
type Document = { id: string; projectId: string; content: string; status: DocumentStatus }

export type SampleState = {
  projects: Map<string, Project>
  documents: Map<string, Document>
  summaries: Map<string, string>
  tags: Map<string, string[]>
}

export type RunningSampleServer = {
  server: Server
  baseUrl: string
  state: SampleState
  close(): Promise<void>
}

export function createSampleServer(processingDelayMs = 750): { server: Server; state: SampleState } {
  const state: SampleState = {
    projects: new Map(),
    documents: new Map(),
    summaries: new Map(),
    tags: new Map(),
  }
  let projectSequence = 0
  let documentSequence = 0

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const segments = url.pathname.split('/').filter(Boolean)

      if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ok: true })

      if (request.method === 'POST' && url.pathname === '/projects') {
        const body = await readJson(request)
        const project: Project = {
          id: `project-${++projectSequence}`,
          name: typeof body.name === 'string' ? body.name : 'Untitled project',
          archived: false,
        }
        state.projects.set(project.id, project)
        return send(response, 201, project)
      }

      if (request.method === 'POST' && segments[0] === 'projects' && segments[2] === 'documents') {
        const project = state.projects.get(segments[1] ?? '')
        if (!project || project.archived) return send(response, 404, { error: 'project not found' })
        const body = await readJson(request)
        if (typeof body.content !== 'string') return send(response, 400, { error: 'content is required' })
        const document: Document = {
          id: `document-${++documentSequence}`,
          projectId: project.id,
          content: body.content,
          status: 'created',
        }
        state.documents.set(document.id, document)
        return send(response, 201, document)
      }

      if (request.method === 'POST' && segments[0] === 'documents' && segments[2] === 'process') {
        const document = state.documents.get(segments[1] ?? '')
        if (!document) return send(response, 404, { error: 'document not found' })
        document.status = 'processing'
        setTimeout(() => {
          document.status = 'processed'
        }, processingDelayMs)
        return send(response, 202, document)
      }

      if (request.method === 'GET' && segments[0] === 'documents' && segments.length === 2) {
        const document = state.documents.get(segments[1] ?? '')
        return document ? send(response, 200, document) : send(response, 404, { error: 'document not found' })
      }

      if (request.method === 'POST' && segments[0] === 'documents' && segments[2] === 'summary') {
        const document = state.documents.get(segments[1] ?? '')
        if (!document) return send(response, 404, { error: 'document not found' })
        if (document.status !== 'processed') return send(response, 409, { error: 'document is still processing' })
        const summary = document.content.slice(0, 80)
        state.summaries.set(document.id, summary)
        return send(response, 201, { documentId: document.id, summary })
      }

      if (request.method === 'POST' && segments[0] === 'documents' && segments[2] === 'tags') {
        const document = state.documents.get(segments[1] ?? '')
        if (!document) return send(response, 404, { error: 'document not found' })
        if (document.status !== 'processed') return send(response, 409, { error: 'document is still processing' })
        const tags = [...new Set(document.content.toLowerCase().match(/[a-z]+/g) ?? [])].slice(0, 8)
        state.tags.set(document.id, tags)
        return send(response, 201, { documentId: document.id, tags })
      }

      if (request.method === 'GET' && segments[0] === 'projects' && segments[2] === 'search') {
        const project = state.projects.get(segments[1] ?? '')
        if (!project || project.archived) return send(response, 404, { error: 'project not found' })
        const query = (url.searchParams.get('q') ?? '').toLowerCase()
        const documents = [...state.documents.values()].filter((document) => {
          if (document.projectId !== project.id) return false
          const searchable = [
            document.content,
            state.summaries.get(document.id) ?? '',
            ...(state.tags.get(document.id) ?? []),
          ].join(' ').toLowerCase()
          return searchable.includes(query)
        })
        return send(response, 200, { documents })
      }

      if (request.method === 'POST' && segments[0] === 'projects' && segments[2] === 'archive') {
        const project = state.projects.get(segments[1] ?? '')
        if (!project) return send(response, 404, { error: 'project not found' })
        project.archived = true
        return send(response, 200, project)
      }

      return send(response, 404, { error: 'not found' })
    } catch (error) {
      return send(response, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  return { server, state }
}

export async function startSampleServer(port = 0, processingDelayMs = 750): Promise<RunningSampleServer> {
  const { server, state } = createSampleServer(processingDelayMs)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Sample server did not bind a TCP port')
  return {
    server,
    state,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  if (chunks.length === 0) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('request body must be an object')
  return parsed as Record<string, unknown>
}

function send(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000)
  startSampleServer(port).then(({ baseUrl }) => process.stdout.write(`sample-app listening on ${baseUrl}\n`))
}
