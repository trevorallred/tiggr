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

class SampleApi {
  readonly state: SampleState = {
    projects: new Map(),
    documents: new Map(),
    summaries: new Map(),
    tags: new Map(),
  }
  private projectSequence = 0
  private documentSequence = 0

  constructor(private readonly processingDelayMs: number) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(requestUrl(request), 'http://localhost')
      const segments = url.pathname.split('/').filter(Boolean)
      const id = pathId(segments)
      const route = routeKey(request.method, url.pathname, segments)
      switch (route) {
        case 'GET:/health': return send(response, 200, { ok: true })
        case 'POST:/projects': return this.createProject(request, response)
        case 'POST:projects:documents': return this.createDocument(request, response, id)
        case 'POST:documents:process': return this.processDocument(response, id)
        case 'GET:documents': return this.getDocument(response, id)
        case 'POST:documents:summary': return this.summarizeDocument(response, id)
        case 'POST:documents:tags': return this.tagDocument(response, id)
        case 'GET:projects:search': {
          return this.searchProject(response, id, searchQuery(url))
        }
        case 'POST:projects:archive': return this.archiveProject(response, id)
        default: return send(response, 404, { error: 'not found' })
      }
    } catch (error) {
      return send(response, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  private async createProject(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await readJson(request)
    const project: Project = {
      id: `project-${String(++this.projectSequence)}`,
      name: typeof body.name === 'string' ? body.name : 'Untitled project',
      archived: false,
    }
    this.state.projects.set(project.id, project)
    send(response, 201, project)
  }

  private async createDocument(request: IncomingMessage, response: ServerResponse, projectId: string): Promise<void> {
    const project = this.state.projects.get(projectId)
    if (!project || project.archived) return send(response, 404, { error: 'project not found' })
    const body = await readJson(request)
    if (typeof body.content !== 'string') return send(response, 400, { error: 'content is required' })
    const document: Document = {
      id: `document-${String(++this.documentSequence)}`,
      projectId: project.id,
      content: body.content,
      status: 'created',
    }
    this.state.documents.set(document.id, document)
    send(response, 201, document)
  }

  private processDocument(response: ServerResponse, documentId: string): void {
    const document = this.state.documents.get(documentId)
    if (!document) return send(response, 404, { error: 'document not found' })
    document.status = 'processing'
    setTimeout(() => {
      document.status = 'processed'
    }, this.processingDelayMs)
    send(response, 202, document)
  }

  private getDocument(response: ServerResponse, documentId: string): void {
    const document = this.state.documents.get(documentId)
    if (document) send(response, 200, document)
    else send(response, 404, { error: 'document not found' })
  }

  private summarizeDocument(response: ServerResponse, documentId: string): void {
    const document = this.processedDocument(response, documentId)
    if (!document) return
    const summary = document.content.slice(0, 80)
    this.state.summaries.set(document.id, summary)
    send(response, 201, { documentId: document.id, summary })
  }

  private tagDocument(response: ServerResponse, documentId: string): void {
    const document = this.processedDocument(response, documentId)
    if (!document) return
    const tags = [...new Set(document.content.toLowerCase().match(/[a-z]+/g) ?? [])].slice(0, 8)
    this.state.tags.set(document.id, tags)
    send(response, 201, { documentId: document.id, tags })
  }

  private processedDocument(response: ServerResponse, documentId: string): Document | undefined {
    const document = this.state.documents.get(documentId)
    if (!document) {
      send(response, 404, { error: 'document not found' })
      return undefined
    }
    if (document.status !== 'processed') {
      send(response, 409, { error: 'document is still processing' })
      return undefined
    }
    return document
  }

  private searchProject(response: ServerResponse, projectId: string, rawQuery: string): void {
    const project = this.state.projects.get(projectId)
    if (!project || project.archived) return send(response, 404, { error: 'project not found' })
    const query = rawQuery.toLowerCase()
    const documents = [...this.state.documents.values()].filter((document) => {
      if (document.projectId !== project.id) return false
      const searchable = [
        document.content,
        this.state.summaries.get(document.id) ?? '',
        ...(this.state.tags.get(document.id) ?? []),
      ].join(' ').toLowerCase()
      return searchable.includes(query)
    })
    send(response, 200, { documents })
  }

  private archiveProject(response: ServerResponse, projectId: string): void {
    const project = this.state.projects.get(projectId)
    if (!project) return send(response, 404, { error: 'project not found' })
    project.archived = true
    send(response, 200, project)
  }
}

function routeKey(method: string | undefined, pathname: string, segments: string[]): string {
  if (pathname === '/health' || pathname === '/projects') return `${method ?? ''}:${pathname}`
  if (method === 'GET' && segments[0] === 'documents' && segments.length === 2) return 'GET:documents'
  return `${method ?? ''}:${segments[0] ?? ''}:${segments[2] ?? ''}`
}

function requestUrl(request: IncomingMessage): string {
  return request.url ?? '/'
}

function pathId(segments: string[]): string {
  return segments[1] ?? ''
}

function searchQuery(url: URL): string {
  return url.searchParams.get('q') ?? ''
}

export function createSampleServer(processingDelayMs = 750): { server: Server; state: SampleState } {
  const api = new SampleApi(processingDelayMs)
  const server = createServer((request, response) => {
    void api.handle(request, response)
  })
  return { server, state: api.state }
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
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    }),
  }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = []
  for await (const chunk of request as AsyncIterable<unknown>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }
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
  void startSampleServer(port).then(({ baseUrl }) => {
    process.stdout.write(`sample-app listening on ${baseUrl}\n`)
  })
}
