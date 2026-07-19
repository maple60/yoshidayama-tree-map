# 吉田山 植樹木マップ

同じGoogle Sheetから、公開先ごとに内容を分けた2種類のサイトを生成します。

| 公開先 | 公開範囲 | 植栽した人の名前 | 生成先 |
|---|---|---|---|
| GitHub Pages | 一般公開 | `planted_by` をJSON生成前に除外 | `_site-public/` |
| Cloudflare Workers | Cloudflare Accessで認証した人のみ | 表示する | `_site-cloudflare/` |

設定を省略した場合は必ず一般公開版になります。元CSVとGoogle認証情報はリポジトリ外へ置き、公開成果物は `scripts/verify_build.R` で検査します。

データの選別、地図表示、2種類の公開経路の仕組みは [`technical.qmd`](technical.qmd) で解説しています。このページはGitHub Pages版とCloudflare版の両方へ生成されます。

## Google Sheet

Sheetは非公開＋サービスアカウント認証を標準とします。移行中に限り、Repository Variable `TREE_SHEET_ACCESS_MODE=public-link` を設定すると「リンクを知っている全員」共有のSheetを匿名取得できます。この場合、元Sheetの全列はリンクを知る人から閲覧可能であり、Cloudflare Accessではその経路を保護できません。

`note` は一般公開版にも表示されるため、個人名などの非公開情報を入力しないでください。

## GitHub Actionsの設定

Repository Actionsへ次を設定します。

**Secrets**

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`: 非公開Sheetへ移行した後に使用

**Variables**

- `TREE_SHEET_ID`: Google Sheet ID
- `TREE_SHEET_ACCESS_MODE`: 通常は未設定。リンク共有中のみ `public-link`
- `TREE_SHEET_GID`: リンク共有モードで取得するタブのgid。未指定なら `0`
- `TREE_SHEET_RANGE`: 非公開モードのみ任意。未指定なら最初のシートの `A:ZZ`
- `GOOGLE_SHEETS_AUTH_READY`: 認証設定とSheet非公開化が終わったら `true`。リンク共有モードでは不要

GitHub Pages版は通常のPages workflowで公開します。Cloudflare版は、GitHub Actionsの **Deploy authenticated tree map to Cloudflare** を手動実行して公開します。

## Cloudflare版の現在の構成

- 本番URL: `https://yoshidayama-tree-map.maple60.workers.dev`
- Workers & Pages → Domains: Productionをオン、Previewをオフ
- Productionの公開範囲: `Restricted`
- 認証方式: One-time PIN
- Access policy: `yoshidayama-tree-map - Production`
- Policy action: `Allow`
- Include: 閲覧を許可する個別の `Emails` のみ
- 独自ドメイン: 使用しない（将来必要になった場合だけ追加）

Accessによる入口の制限に加え、`worker/index.js` でもAccess JWTの署名、発行者、audience、有効期限を `jose` で検証します。`wrangler.jsonc` の `TEAM_DOMAIN` と `POLICY_AUD` で対象Access applicationを指定し、検証に成功したリクエストだけをStatic Assetsへ渡す二重の防御です。

詳しい設定、初回確認、更新方法は [`notebook/cloudflare-workers-deployment.qmd`](notebook/cloudflare-workers-deployment.qmd) を参照してください。
