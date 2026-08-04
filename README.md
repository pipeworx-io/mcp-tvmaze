# @pipeworx/tvmaze

TVMaze MCP — TV show metadata, episodes, schedules, cast. No auth.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

- `search_shows(query)`
- `get_show(show_id, embed_episodes?, embed_cast?, embed_seasons?)`
- `list_episodes(show_id, specials?)`
- `get_schedule(country?, date?)`
- `search_people(query)`

## Data source

`https://api.tvmaze.com` — public REST/JSON.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "tvmaze": {
      "url": "https://gateway.pipeworx.io/tvmaze/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Tvmaze data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
