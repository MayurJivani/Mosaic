/**
 * Twitch, BetterTTV (BTTV), FrankerFaceZ (FFZ), and 7TV Emote Library & API integration.
 * Direct connections to provider API servers — zero manual hardcoded preset emotes.
 */

export const PRESET_EMOTES = []

/**
 * Direct GraphQL query search against 7TV database (1.6M+ emotes)
 */
export async function search7TVEmotes(query, limit = 100) {
  try {
    const res = await fetch("https://7tv.io/v3/gql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query SearchEmotes($q: String!, $limit: Int) { emotes(query: $q, limit: $limit) { items { id name animated host { url } } } }`,
        variables: { q: query || "", limit }
      })
    })
    if (!res.ok) return []
    const data = await res.json()
    const items = data.data?.emotes?.items || []
    return items.map((item) => ({
      id: `7tv-${item.id}`,
      name: item.name,
      provider: "7TV",
      url: item.host?.url ? `https:${item.host.url}/3x.webp` : `https://cdn.7tv.app/emote/${item.id}/3x.webp`,
      animated: !!item.animated,
    }))
  } catch {
    return []
  }
}

/**
 * Direct fetch for live global BTTV emotes
 */
export async function fetchBTTVGlobal() {
  try {
    const res = await fetch("https://api.betterttv.net/3/cached/emotes/global")
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data.map((e) => ({
      id: `bttv-${e.id}`,
      name: e.code,
      provider: "BTTV",
      url: `https://cdn.betterttv.net/emote/${e.id}/3x.${e.imageType || "webp"}`,
      animated: !!e.animated,
    }))
  } catch {
    return []
  }
}

/**
 * Direct fetch for live 7TV emotes (global set + top 100 trending database emotes)
 */
export async function fetch7TVGlobal() {
  try {
    // 1. Fetch global set
    const res = await fetch("https://7tv.io/v3/emote-sets/global")
    let list = []
    if (res.ok) {
      const data = await res.json()
      list = data.emotes || []
    }
    const globalEmotes = list.map((item) => {
      const e = item.data || item
      const id = e.id || item.id
      const hostUrl = e.host?.url || item.host?.url
      const url = hostUrl ? `https:${hostUrl}/3x.webp` : `https://cdn.7tv.app/emote/${id}/3x.webp`
      return {
        id: `7tv-${id}`,
        name: item.name || e.name || "Emote",
        provider: "7TV",
        url,
        animated: !!e.animated,
      }
    })

    // 2. Fetch top 100 trending emotes directly from 7TV GraphQL API
    const topEmotes = await search7TVEmotes("", 100)

    const map = new Map()
    for (const e of [...globalEmotes, ...topEmotes]) {
      if (!map.has(e.id)) map.set(e.id, e)
    }
    return Array.from(map.values())
  } catch {
    return []
  }
}

/**
 * Direct fetch for live global FrankerFaceZ emotes
 */
export async function fetchFFZGlobal() {
  try {
    const res = await fetch("https://api.frankerfacez.com/v1/set/global")
    if (!res.ok) return []
    const data = await res.json()
    const sets = data.sets || {}
    const emotes = []
    for (const setId in sets) {
      for (const e of sets[setId].emoticons || []) {
        const urls = e.urls || {}
        const imgUrl = urls["4"] || urls["2"] || urls["1"] || `//cdn.frankerfacez.com/emoticon/${e.id}/2`
        const fullUrl = imgUrl.startsWith("http") ? imgUrl : imgUrl.startsWith("//") ? `https:${imgUrl}` : `https://${imgUrl}`
        emotes.push({
          id: `ffz-${e.id}`,
          name: e.name,
          provider: "FFZ",
          url: fullUrl,
          animated: !!e.animated,
        })
      }
    }
    return emotes
  } catch {
    return []
  }
}

/**
 * Direct fetch for a streamer's channel emotes across 7TV, BTTV, and FFZ
 */
export async function fetchStreamerEmotes(username) {
  const cleanUser = username.trim().toLowerCase().replace(/^@/, "")
  if (!cleanUser) return []

  const results = []

  try {
    // 1. Look up Twitch ID and FFZ channel emotes via FrankerFaceZ room API
    const roomRes = await fetch(`https://api.frankerfacez.com/v1/room/${cleanUser}`)
    let twitchId = null

    if (roomRes.ok) {
      const roomData = await roomRes.json()
      twitchId = roomData.room?.twitch_id

      const sets = roomData.sets || {}
      for (const setId in sets) {
        for (const e of sets[setId].emoticons || []) {
          const urls = e.urls || {}
          const imgUrl = urls["4"] || urls["2"] || urls["1"] || `//cdn.frankerfacez.com/emoticon/${e.id}/2`
          const fullUrl = imgUrl.startsWith("http") ? imgUrl : imgUrl.startsWith("//") ? `https:${imgUrl}` : `https://${imgUrl}`
          results.push({
            id: `ffz-ch-${e.id}`,
            name: e.name,
            provider: "FFZ",
            url: fullUrl,
            animated: !!e.animated,
          })
        }
      }
    }

    if (twitchId) {
      // 2. Direct fetch 7TV channel emotes for streamer
      try {
        const stvRes = await fetch(`https://7tv.io/v3/users/twitch/${twitchId}`)
        if (stvRes.ok) {
          const stvData = await stvRes.json()
          const stvList = stvData.emote_set?.emotes || []
          for (const item of stvList) {
            const e = item.data || item
            const id = e.id || item.id
            const hostUrl = e.host?.url || item.host?.url
            const url = hostUrl ? `https:${hostUrl}/3x.webp` : `https://cdn.7tv.app/emote/${id}/3x.webp`
            results.push({
              id: `7tv-ch-${id}`,
              name: item.name || e.name || "Emote",
              provider: "7TV",
              url,
              animated: !!e.animated,
            })
          }
        }
      } catch {}

      // 3. Direct fetch BTTV channel & shared emotes for streamer
      try {
        const bttvRes = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`)
        if (bttvRes.ok) {
          const bttvData = await bttvRes.json()
          const allBttv = [...(bttvData.channelEmotes || []), ...(bttvData.sharedEmotes || [])]
          for (const e of allBttv) {
            results.push({
              id: `bttv-ch-${e.id}`,
              name: e.code,
              provider: "BTTV",
              url: `https://cdn.betterttv.net/emote/${e.id}/3x.${e.imageType || "webp"}`,
              animated: !!e.animated,
            })
          }
        }
      } catch {}
    }
  } catch {}

  return results
}
