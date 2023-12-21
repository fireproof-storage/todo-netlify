import { getStore } from '@netlify/blobs'

type CRDTEntry = {
  data: string
  cid: string
  parents: string[]
}

export default async (req: Request) => {
  const url = new URL(req.url)
  const carId = url.searchParams.get('car')
  const metaDb = url.searchParams.get('meta')
  if (carId) {
    const carFiles = getStore('cars')
    if (req.method === 'PUT') {
      const carArrayBuffer = new Uint8Array(await req.arrayBuffer())
      await carFiles.set(carId, carArrayBuffer)
      return new Response(JSON.stringify({ ok: true }), { status: 201 })
    } else if (req.method === 'GET') {
      const carArrayBuffer = await carFiles.get(carId)
      return new Response(carArrayBuffer, { status: 200 })
    }
  } else if (metaDb) {
    // problem: deletes are faster than write availability, so we can end up with mostly an empty list
    // solution: don't delete until read, eg use the parents list at read time to mask and delete outdated entries
    const meta = getStore('meta')
    if (req.method === 'PUT') {
      const { data, cid, parents } = (await req.json()) as CRDTEntry
      await meta.setJSON(`${metaDb}/${cid}`, { data, parents })
      // for (const p of parents) {
      //   void meta.delete(`${metaDb}/${p}`)
      // }
      return new Response(JSON.stringify({ ok: true }), { status: 201 })
    } else if (req.method === 'GET') {
      const { blobs } = await meta.list({ prefix: `${metaDb}/` })
      const allParents = [] as string[]
      const entries = (
        await Promise.all(
          blobs.map(async blob => {
            const { data, parents } = await meta.get(blob.key, { type: 'json' })
            for (const p of parents) {
              allParents.push(p.toString())
              void meta.delete(`${metaDb}/${p}`)
            }
            return { cid: blob.key.split('/')[1], data }
          })
        )
      ).filter(entry => (entry.data !== null && !allParents.includes(entry.cid)))
      return new Response(JSON.stringify(entries), { status: 200 })
    }
  } else {
    return new Response(JSON.stringify({ error: 'Invalid path' }), { status: 400 })
  }
}

export const config = { path: '/fireproof' }
