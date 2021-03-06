# RTMP Reports (ソースファイル)

RTMP サーバの実装の過程でわかってきたことをレポートのフォーマットでまとめていきます. アプリケーションを ~~Vue.js~~ Nuxt.js で作り, 記事を Markdown で書いています.

## 執筆の目的

### (最新の)仕様と実装の情報の更新と永続化

RTMP プロトコルは現在, サードパーティが実装していく上で以下の問題があります:

* Adobe Systems Inc.が公開している公式のドキュメントが 2012 年で更新が止まっていて, かなり古いです.
  * 最新のサードパーティアプリケーションが実際に通信している内容と乖離が発生してしまっています.
* サードパーティアプリケーションに関しても, クライアント側にせよサーバ側にせよ, 実装している箇所を確認しにくいことがあります.
* アプリケーションによって実装や送受信されるデータの扱いに違いがあることがあります.
  * その挙動がプロトコルによって共通(必須)化されたものなのか, アプリケーションが独自に行なっているものなのかがわかりにくいです.
* 他方で, Flash/ActionScript が前提だった枯れた技術といっても, まだまだ応用する余地が残っています.
  * SIP の代替として通話に利用するところも出始めているらしいです.
  * 一般的なアプリケーションでは依然として映像送受信のプロトコルとして使われ続けており, 現時点では完全には置き換えるのは不可能と言えます.

上記の実態がまだ存在している中で, 最新の状態でまとめて参照できる情報を残しておかないのはとても不便と感じました.

### 実装の備忘録の保存

RTMP 自体はあくまでネットワークを流れるパケットを処理するためのプロトコルの一つにすぎませんが, これを用いて実際にサービスを稼働させるにあたり, 付随する以下の技術が必要不可欠です:

* サーバプログラムを実装する技術.
* 音声や映像を変換する技術.
* ウェブアプリケーションを実装する技術.
* サーバマシンを安全に稼動させる技術.

上記技術の実装内容, 実装過程でわかったこと, および気をつけなければいけないこと等を忘れないようにするため, 内容をより整理された形で文書化し, GitHub 等に保管していきます.

### フロントエンドフレームワークに関する知識の更新

ポートフォリオを書いて以来Vue.jsの利用を放置気味だったので, より応用の利いた使い方ができるように知識と技術を更新していきます.

### 文章と思考を纏める練習

私はこれがとても苦手なので, レポート風に書いていくことで要点の整理や伝え方を洗練していければなと思っています.

## 進捗状況

- [x] RTMPの概要.
- [x] ハンドシェークの手順と実装.
- [x] `Invoke(connect)` を受信してから映像データを受信するまで.
- [ ] 映像・音声データの処理方法.
- [ ] RTMPT/RTMPTS 対応 (HTTP/HTTPS のポートに乗せる).
  - [ ] hyper/hyper-tls で HTTP/HTTPS サーバ化.
  - [ ] futures-rs で並行並列対応.
- [ ] テストの書き方と評価基準.
- [ ] ネットワークの負荷分散.
  - [ ] 物理ポートの数とスレッドの割り当て方.
  - [ ] スレッドの生やし方.
  - [ ] マルチプロセスにするべきかどうか.
  - [ ] CDN やクラウドストレージを視野に入れる場合.
- [ ] 音声コーデックと映像コーデックの実装.
- [ ] RTMP を HTTP Live Streaming や SRT に置き換えていくまでの流れ.
- [x] このアプリケーション自体.
  - [x] Nuxt.js への移行(静的サイト生成への切り替え).

## ライセンス

未定.
