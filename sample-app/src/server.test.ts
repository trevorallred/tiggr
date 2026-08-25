import { startSampleServer } from './server.js'

describe('sample HTTP app', () => {
  it('processes documents asynchronously and scopes search by project', async () => {
    const running = await startSampleServer(0, 30)
    try {
      const project = await post<{ id: string }>(running.baseUrl, '/projects', { name: 'one' })
      const other = await post<{ id: string }>(running.baseUrl, '/projects', { name: 'two' })
      const document = await post<{ id: string; status: string }>(running.baseUrl, `/projects/${project.id}/documents`, {
        content: 'shared-token one',
      })
      await post(running.baseUrl, `/projects/${other.id}/documents`, { content: 'shared-token two' })

      const queued = await fetch(`${running.baseUrl}/documents/${document.id}/process`, { method: 'POST' })
      expect(queued.status).toBe(202)
      expect((await queued.json()) as object).toMatchObject({ status: 'processing' })
      await new Promise((resolve) => setTimeout(resolve, 45))

      const search = await fetch(`${running.baseUrl}/projects/${project.id}/search?q=shared-token`)
      const body = (await search.json()) as { documents: { projectId: string }[] }
      expect(body.documents).toHaveLength(1)
      expect(body.documents[0]?.projectId).toBe(project.id)
    } finally {
      await running.close()
    }
  })
})

async function post<Output>(baseUrl: string, path: string, body?: object): Promise<Output> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) throw new Error(`${path} returned ${response.status}`)
  return (await response.json()) as Output
}
