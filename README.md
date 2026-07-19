# 吉田山 植樹木マップ

同じGoogle Sheetから、次の2種類の静的サイトを生成します。

- GitHub Pages向け一般公開版: `planted_by` をJSON生成前に除外
- Cloudflare Access向け認証限定版: `planted_by` を表示

設定を省略した場合は必ず一般公開版になります。元CSVとGoogle認証情報はリポジトリ外へ置き、公開成果物は `scripts/verify_build.R` で検査します。

Sheetは非公開＋サービスアカウント認証を標準とします。移行中に限り、Repository Variable `TREE_SHEET_ACCESS_MODE=public-link` を設定すると「リンクを知っている全員」共有のSheetを匿名取得できます。この場合、元Sheetの全列はリンクを知る人から閲覧可能です。

## GitHub Actionsの設定

Repository Actionsへ次を設定します。

- Secret `GOOGLE_SERVICE_ACCOUNT_JSON`: 対象Sheetだけを閲覧できるサービスアカウント鍵
- Variable `TREE_SHEET_ID`: Google Sheet ID
- Variable `TREE_SHEET_ACCESS_MODE`: 通常は未設定。リンク共有中のみ `public-link`
- Variable `TREE_SHEET_GID`: リンク共有モードで取得するタブのgid。未指定なら `0`
- Variable `TREE_SHEET_RANGE`: 非公開モードのみ任意。未指定なら最初のシートの `A:ZZ`
- Variable `GOOGLE_SHEETS_AUTH_READY`: 認証設定とSheet非公開化が終わったら `true`。リンク共有モードでは不要
- Cloudflare用Secrets `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`

`note` は一般公開版にも表示されるため、個人名などの非公開情報を入力しないでください。

Cloudflare Workerは初期状態では `workers.dev`、Preview URL、Custom Domainのすべてを無効にしています。Cloudflare Accessを設定してからCustom Domain routeを追加してください。
