interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * TVMaze MCP — TV show metadata, episodes, schedules (no auth)
 *
 * Complements the `movies` pack (film-only). TVMaze covers air dates, network/
 * web-channel data, cast, and per-episode info that TMDB doesn't surface
 * cleanly.
 *
 * API: https://www.tvmaze.com/api
 * Tools:
 * - search_shows:   text search
 * - get_show:       full show record with optional embeds (episodes, cast, seasons)
 * - list_episodes:  episode list for a show
 * - get_schedule:   what's airing on a given day in a country
 * - search_people:  actor / person search
 */


const BASE_URL = 'https://api.tvmaze.com';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_shows',
    description:
      'Search TV shows by name. Returns shows with id, name, premiere date, network, genres, rating, status, and TVMaze URL.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Show name (full or partial)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_show',
    description:
      'Fetch a full show record by TVMaze ID. Optionally embed episodes, cast, seasons, or previous/next episode info for richer responses.',
    inputSchema: {
      type: 'object',
      properties: {
        show_id: { type: 'number', description: 'TVMaze show ID' },
        embed_episodes: { type: 'boolean', description: 'Include full episode list' },
        embed_cast: { type: 'boolean', description: 'Include cast' },
        embed_seasons: { type: 'boolean', description: 'Include season metadata' },
      },
      required: ['show_id'],
    },
  },
  {
    name: 'list_episodes',
    description:
      'List all episodes of a show. Returns season, number, name, airdate, runtime, and summary.',
    inputSchema: {
      type: 'object',
      properties: {
        show_id: { type: 'number', description: 'TVMaze show ID' },
        specials: { type: 'boolean', description: 'Include special episodes (default false)' },
      },
      required: ['show_id'],
    },
  },
  {
    name: 'get_schedule',
    description:
      'What TV shows are airing on a given day in a country. Useful for "what aired last night on UK TV". Returns episode + show records.',
    inputSchema: {
      type: 'object',
      properties: {
        country: { type: 'string', description: '2-letter country code (default "US")' },
        date: { type: 'string', description: 'YYYY-MM-DD (default today)' },
      },
      required: [],
    },
  },
  {
    name: 'search_people',
    description: 'Search actors / people by name. Returns id, name, country, birthday, gender, image.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Person name' },
      },
      required: ['query'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'search_shows':
      return searchShows(reqStr(args, 'query', '"the wire"'));
    case 'get_show':
      return getShow(args);
    case 'list_episodes':
      return listEpisodes(args);
    case 'get_schedule':
      return getSchedule(args);
    case 'search_people':
      return searchPeople(reqStr(args, 'query', '"bryan cranston"'));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function reqStr(args: Record<string, unknown>, key: string, example: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Required argument "${key}" is missing or empty. Pass a string like ${example}.`);
  }
  return v;
}

async function tvmFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (res.status === 404) throw new Error('TVMaze: not found (HTTP 404)');
  if (res.status === 429) throw new Error('TVMaze: rate-limit (HTTP 429)');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TVMaze error: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function stripHtml(s?: string | null): string | null {
  if (!s) return null;
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
}

interface TvmShow {
  id?: number;
  url?: string;
  name?: string;
  type?: string;
  language?: string;
  genres?: string[];
  status?: string;
  runtime?: number;
  averageRuntime?: number;
  premiered?: string;
  ended?: string | null;
  officialSite?: string | null;
  rating?: { average?: number | null };
  network?: { name?: string; country?: { code?: string; name?: string } } | null;
  webChannel?: { name?: string; country?: { code?: string; name?: string } | null } | null;
  externals?: { tvrage?: number | null; thetvdb?: number | null; imdb?: string | null };
  image?: { medium?: string; original?: string };
  summary?: string;
  _embedded?: {
    episodes?: TvmEpisode[];
    cast?: TvmCast[];
    seasons?: TvmSeason[];
  };
}

interface TvmEpisode {
  id?: number;
  url?: string;
  name?: string;
  season?: number;
  number?: number;
  type?: string;
  airdate?: string;
  airtime?: string;
  runtime?: number;
  rating?: { average?: number | null };
  summary?: string;
}

interface TvmCast {
  person?: { id?: number; name?: string; image?: { medium?: string; original?: string } | null };
  character?: { id?: number; name?: string };
}

interface TvmSeason {
  id?: number;
  number?: number;
  episodeOrder?: number;
  premiereDate?: string;
  endDate?: string;
  network?: { name?: string } | null;
  summary?: string;
}

function normalizeShow(s: TvmShow) {
  return {
    id: s.id ?? null,
    name: s.name ?? null,
    type: s.type ?? null,
    language: s.language ?? null,
    genres: s.genres ?? [],
    status: s.status ?? null,
    runtime_min: s.runtime ?? s.averageRuntime ?? null,
    premiered: s.premiered ?? null,
    ended: s.ended ?? null,
    official_site: s.officialSite ?? null,
    rating: s.rating?.average ?? null,
    network: s.network?.name ?? s.webChannel?.name ?? null,
    network_country: s.network?.country?.code ?? s.webChannel?.country?.code ?? null,
    imdb_id: s.externals?.imdb ?? null,
    tvdb_id: s.externals?.thetvdb ?? null,
    image: s.image?.original ?? s.image?.medium ?? null,
    summary: stripHtml(s.summary),
    tvmaze_url: s.url ?? null,
  };
}

function normalizeEpisode(e: TvmEpisode) {
  return {
    id: e.id ?? null,
    season: e.season ?? null,
    number: e.number ?? null,
    name: e.name ?? null,
    type: e.type ?? null,
    airdate: e.airdate ?? null,
    airtime: e.airtime ?? null,
    runtime_min: e.runtime ?? null,
    rating: e.rating?.average ?? null,
    summary: stripHtml(e.summary),
    tvmaze_url: e.url ?? null,
  };
}

async function searchShows(query: string) {
  const data = await tvmFetch<{ score?: number; show?: TvmShow }[]>(
    `/search/shows?q=${encodeURIComponent(query)}`,
  );
  return {
    query,
    count: data.length,
    results: data.map((r) => ({
      score: r.score ?? null,
      ...normalizeShow(r.show ?? {}),
    })),
  };
}

async function getShow(args: Record<string, unknown>) {
  const id = args.show_id as number;
  if (!id) throw new Error('show_id is required');
  const embed: string[] = [];
  if (args.embed_episodes) embed.push('episodes');
  if (args.embed_cast) embed.push('cast');
  if (args.embed_seasons) embed.push('seasons');
  const qs = embed.length ? `?embed[]=${embed.join('&embed[]=')}` : '';
  const data = await tvmFetch<TvmShow>(`/shows/${id}${qs}`);

  const out: Record<string, unknown> = normalizeShow(data);
  if (data._embedded?.episodes) {
    out.episodes = data._embedded.episodes.map(normalizeEpisode);
  }
  if (data._embedded?.cast) {
    out.cast = data._embedded.cast.map((c) => ({
      person_id: c.person?.id ?? null,
      person_name: c.person?.name ?? null,
      character_id: c.character?.id ?? null,
      character_name: c.character?.name ?? null,
      image: c.person?.image?.medium ?? null,
    }));
  }
  if (data._embedded?.seasons) {
    out.seasons = data._embedded.seasons.map((s) => ({
      id: s.id ?? null,
      number: s.number ?? null,
      episode_order: s.episodeOrder ?? null,
      premiere_date: s.premiereDate ?? null,
      end_date: s.endDate ?? null,
      network: s.network?.name ?? null,
      summary: stripHtml(s.summary),
    }));
  }
  return out;
}

async function listEpisodes(args: Record<string, unknown>) {
  const id = args.show_id as number;
  if (!id) throw new Error('show_id is required');
  const specials = args.specials ? '?specials=1' : '';
  const data = await tvmFetch<TvmEpisode[]>(`/shows/${id}/episodes${specials}`);
  return {
    show_id: id,
    count: data.length,
    episodes: data.map(normalizeEpisode),
  };
}

async function getSchedule(args: Record<string, unknown>) {
  const country = (args.country as string) ?? 'US';
  const date = args.date as string | undefined;
  const params = new URLSearchParams({ country });
  if (date) params.set('date', date);

  const data = await tvmFetch<(TvmEpisode & { show?: TvmShow })[]>(`/schedule?${params}`);
  return {
    country,
    date: date ?? 'today',
    count: data.length,
    airings: data.map((e) => ({
      ...normalizeEpisode(e),
      show: e.show ? normalizeShow(e.show) : null,
    })),
  };
}

interface TvmPerson {
  id?: number;
  name?: string;
  country?: { name?: string; code?: string } | null;
  birthday?: string | null;
  deathday?: string | null;
  gender?: string | null;
  image?: { medium?: string; original?: string } | null;
  url?: string;
}

async function searchPeople(query: string) {
  const data = await tvmFetch<{ score?: number; person?: TvmPerson }[]>(
    `/search/people?q=${encodeURIComponent(query)}`,
  );
  return {
    query,
    count: data.length,
    results: data.map((r) => ({
      score: r.score ?? null,
      id: r.person?.id ?? null,
      name: r.person?.name ?? null,
      country: r.person?.country?.code ?? null,
      birthday: r.person?.birthday ?? null,
      deathday: r.person?.deathday ?? null,
      gender: r.person?.gender ?? null,
      image: r.person?.image?.medium ?? null,
      tvmaze_url: r.person?.url ?? null,
    })),
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
