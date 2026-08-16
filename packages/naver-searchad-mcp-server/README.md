# Naver Search Ads MCP server

Read-only MCP tools for Naver Search Ads campaign, ad group, and keyword
performance analysis.

Required environment variables:

- `NAVER_SEARCH_AD_ACCESS_LICENSE`
- `NAVER_SEARCH_AD_SECRET_KEY`
- `NAVER_SEARCH_AD_CUSTOMER_ID`

Alternatively, set `NAVER_SEARCH_AD_CREDENTIALS_PATH` to a protected dotenv
file containing those three variables. Only those exact keys are read.

Credentials are sent only to the fixed official API origin
`https://api.searchad.naver.com`; the runtime host is not configurable.

The server intentionally exposes no campaign, bid, budget, or keyword mutation
tools.
