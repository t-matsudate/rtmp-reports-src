[[toc]]

## はじめに

私は RTMP サーバを実装するにあたって, まず Adobe Systems Inc. が公式に発行しているドキュメントや既存の OSS 製品を参照した. しかし, それらには以下の問題があることがわかった.

* 公式のドキュメントが 2012 年発行のものと古く, 既存製品の最新の通信手順/通信内容からかけ離れてきている.
  * ブログ等の既出の実装記事/解説記事についても, 時と共に最新の実装や仕様からはかけ離れてしまうという問題がある.
* 既存製品(OSS 製品等目視確認できる範囲に限る)についても実装箇所を整理しにくい部分がある.
* また, 既存製品は用いたプログラミング言語やフレームワークによって実装内容に差異があり, プロトコルで共通化されている部分なのか製品側が独自に実装している部分なのかの区別をつけにくいことがある.

上記を解消する方法の一つとして, 私は自分自身で実装を行いながら, 当該プロトコルのサーバサイド/クライアントサイド両面の概要, 処理手順, 実装内容, およびそれらを解説する情報を随時更新していこうと考えた.

## RTMP とは

RTMP とは, TCP 上で映像や音声の送受信を行うプロトコルの 1 つである. Adobe Systems Inc. によって, 当時の Flash Player および Adobe Media Server 間で帯域の圧迫を避けながら映像/音声パケットを効率よく送受信するためのパケットのフォーマットおよび当該パケットの送受信手順について取り決められている.  
また,  RTMP には同じ手段で通信するものとして以下のような派生プロトコルも存在している.

* RTMPE: 送信側が RTMP のハンドシェイクパケットを DH 暗号により暗号化してから通信を行うプロトコルである. ただし, あくまでパケットの暗号化であり通信経路自体は保護されていないため, 中間者攻撃等によりパケットごとすり替えられる脆弱性が存在する.
* RTMPS: RTMP に TLS/SSL による暗号化および接続手順を合成したプロトコルである. TLS/SSL の証明書を付随させることにより、中間者攻撃等の被害を受けるリスクは軽減されている.
* RTMPT/RTMPTE/RTMPTS: RTMP/RTMPE の通信を HTTP/HTTPS 上で行うプロトコルである. これらは RTMP に依存しない各種マネージドサービスとの連携による負荷分散が可能であり, 特に RTMPTS は HTTPS によって通信経路が保護されているため, RTMP/RTMPE はもとより RTMPS と比べてもセキュリティの信頼性が高いプロトコルと言える. 

RTMP および上記派生プロトコルのいずれも本質的には

1. 当該プロトコルとしてのハンドシェイクを成立させる.
2. アプリケーション間接続に必要な情報を相互に伝達しあう.
3. 単位あたりのデータ量を帯域を圧迫しない程度に抑えつつ, 映像/音声データの送受信を行う.

の 3 つの要件が大前提である. また, 上記 3 要件を満たせればよいことから, 近年では SIP 等の通話向けプロトコルの代替としての採用も確認され始めている.

### 当該プロトコルを採用している製品(OSS)

* [Red5](https://github.com/Red5/red5-server/)

Java 言語で実装されたマルチメディアサーバである. RTMP を始め HLS による MPEG2-TS の転送や WebSocket を利用したコミュニケーションにも対応している. 有償ではあるがより高度な機能を搭載した Pro 版も存在している.

* [FFmpeg](https://github.com/FFmpeg/FFmpeg/)

動画や音声のエンコーダソフトである. C 言語で実装されている. 本来は動画や音声の変換がメインであるが, RTMP の登場に合わせて当該プロトコルでの外部サーバへの映像データの送信に対応した.  
また, ffserver というパッケージを導入することによってサーバとしての動きにも対応可能である. 

* [OBS](https://github.com/obsproject/obs-studio/)

クライアントとしての映像/音声の配置や送信に注力したソフトウェアである. C 言語で実装されている. Windows を始め MacOS や Linux 等各種 OS に対してそれぞれパッケージが用意されているため, マルチプラットフォームと言っても差し支えないと思われる.

## RTMP 接続の手順

<div id="rtmp-connection-flows"></div>

図1. RTMPの大まかな流れ {#caption-rtmp-connection-flows}

1. サーバ側は TCP の 1935 番ポートを開放し, クライアント側からの接続を待ち受ける.
2. クライアント側はサーバ側に TCP での接続を受理されたなら, TCP ハンドシェイクの後に RTMP 層でのハンドシェイクを行う.  
(TCP パケットの受信方法や TCP ハンドシェイクの実装がまだである場合は, それも行う必要がある.)
3. クライアント側はサーバ側に送信したハンドシェイクチャンクが妥当であると判断されたなら, RTMP 層でのアプリケーション接続を開始する.
4. アプリケーション接続に成功したなら, サーバ側はクライアント側とやり取りするメッセージストリームに一意に ID を割り当てる.
5. 映像/音声チャンクの送受信を開始する.

### RTMP ハンドシェイク

RTMP ハンドシェイクの手順は公式ドキュメント[^RTMP-Specification-1.0]では以下のように定義されている.

<div id="rtmp-handshake-sequences-official">

!!!include(handshake-sequences-official.md)!!!

</div>

図2. 公式ドキュメントが説明している RTMP ハンドシェイクのシーケンス {#caption-rtmp-handshake-sequences-official}

> 5.2.1.  Handshake Sequence
>
> The handshake begins with the client sending the C0 and C1 chunks.
>
> The client MUST wait until S1 has been received before sending C2.
> The client MUST wait until S2 has been received before sending any other data.
>
> The server MUST wait until C0 has been received before sending S0 and S1, and MAY wait until after C1 as well.
> The server MUST wait until C1 has been received before sending S2.
> The server MUST wait until C2 has been received before sending any other data.


* ハンドシェイクはクライアント側がサーバ側に C0 チャンクと C1 チャンクを送信することで始まる.
* クライアント側は C2 チャンクの送信前に S1 の受信を待た**なければならない**.
* クライアント側はその後の他のチャンクの送信前に S2 チャンクの受信を待た**なければならない**.
* サーバ側は S2 チャンクの送信前に C1 チャンクの受信を待た**なければならない**.
* サーバ側はその後の他のチャンクの送信前に C2 チャンクの受信を待た**なければならない**.

> The following describes the states mentioned in the handshake diagram:
>
> Uninitialized: The protocol version is sent during this stage. Both the client and server are uninitialized. The The client sends the protocol version in packet C0. If the server supports the version, it sends S0 and S1 in response. If not, the server responds by taking the appropriate action. In RTMP, this action is terminating the connection.  
> Version Sent:  Both client and server are in the Version Sent state after the Uninitialized state. The client is waiting for the packet S1 and the server is waiting for the packet C1. On receiving the awaited packets, the client sends the packet C2 and the server sends the packet S2. The state then becomes Ack Sent.  
> Ack Sent: The client and the server wait for S2 and C2 respectively.  
> Handshake Done: The client and the server exchange messages.

* 未初期化

プロトコルのバージョンが送信される. クライアント側もサーバ側も未初期化である. クライアント側はプロトコルのバージョンを C0 パケットで送信する. サーバ側はそのバージョンをサポートしているならば, クライアント側に応答メッセージで S0 パケットと S1 パケットを送信する. そうでなければ, サーバ側は適切なアクションをとって応答メッセージを送信する. RTMP では, そのアクションは接続の終了である.

* RTMP バージョンが送信された

サーバ側もクライアント側も未初期化状態の後は RTMP バージョンが送信された状態である. クライアント側は S1 パケットを待ちサーバ側は C1 パケットを待つ. 待機パケットの受信時に, クライアント側はサーバ側に C2 パケットを送信し, サーバ側はクライアント側に S2 パケットを送信する. それから肯定応答が送信された状態になる.

* 肯定応答が送信された

クライアント側とサーバ側はそれぞれ S2 と C2 を待つ.

* ハンドシェイクが完了した

クライアント側とサーバ側はメッセージを交換する.

各種チャンクのフィールドは, 公式ドキュメント[^RTMP-Specification-1.0]では以下のように定義されている.

#### C0 チャンクおよび S0 チャンク

1. 利用する RTMP のバージョン(1 byte)

> In C0, this field identifies the RTMP version requested by the client.
> In S0, this field identifies the RTMP version selected by the server.
> The version defined by this specification is 3.
> Values 0-2 are deprecated values used by earlier proprietary products; 4-31 are reserved for future implementations; and 32-255 are not allowed (to allow distinguishing RTMP from text-based protocols, which always start with a printable character).
> A server that does not recognize the client’s requested version SHOULD respond with 3.
> The client MAY choose to degrade to version 3, or to abandon the handshake.

* 双方が利用する RTMP のバージョンを指定する.
* 基本的に, 指定できるバージョンは 3 である.
  * 0 から 2 は本リリース前の企業製品によって使用されていたため非推奨である.
  * 4 から 31 は未来のために予約している.
  * 31 より大きい数はそもそも認めていない.
* サーバ側は, クライアント側から要求されたバージョンを認識できない時は 3 と**すべきである**.
* その場合, クライアント側はバージョンを 3 にグレードダウンするか接続を中止するかを選んで**よい**.

とされているが, 2019 年現在このフィールドに指定できるバージョンは以下の通りである.

* 3(RTMP)
* 6(RTMPE)

以下は Red5 および OBS が認識しているバージョンである.

* 8(RTMPE/XTEA)
* 9(RTMPE/Blowfish)

以下に各 OSS 製品の該当部分の実装を示す.

FFmpeg/rtmpproto.c#L1200-L1236[^FFmpeg/rtmpproto.c#L1200-L1236]

```c
uint8_t tosend [RTMP_HANDSHAKE_PACKET_SIZE+1] = {
    3,                // unencrypted data
    0, 0, 0, 0,       // client uptime
    RTMP_CLIENT_VER1,
    RTMP_CLIENT_VER2,
    RTMP_CLIENT_VER3,
    RTMP_CLIENT_VER4,
};

// 中略

if (CONFIG_FFRTMPCRYPT_PROTOCOL && rt->encrypted) {
    /* When the client wants to use RTMPE, we have to change the command
     * byte to 0x06 which means to use encrypted data and we have to set
     * the flash version to at least 9.0.115.0. */
    tosend[0] = 6;
    tosend[5] = 128;
    tosend[6] = 0;
    tosend[7] = 3;
    tosend[8] = 2;

    /* Initialize the Diffie-Hellmann context and generate the public key
     * to send to the server. */
    if ((ret = ff_rtmpe_gen_pub_key(rt->stream, tosend + 1)) < 0)
        return ret;
}
```

obs-studio/rtmp.c#L4062[^obs-studio/rtmp.c#L4062]

```c
clientbuf[0] = 0x03;		/* not encrypted */
```

obs-studio/handshake.h#L831-L837[^obs-studio/handshake.h#L831-L837]

```c
if (encrypted)
{
    clientsig[-1] = 0x06;	/* 0x08 is RTMPE as well */
    offalg = 1;
}
else
    clientsig[-1] = 0x03;
```

red5-server-common/RTMPHandshake.java#L56[^red5-server-common/RTMPHandshake.java#L56]

```java
public final static String[] HANDSHAKE_TYPES = {"Undefined0", "Undefined1", "Undefined2", "RTMP", "Undefined4", "Undefined5", "RTMPE", "Undefined7", "RTMPE XTEA", "RTMPE BLOWFISH"};
```

#### C1 チャンクおよび S1 チャンク

1. タイムスタンプ(4 bytes)

> This field contains a timestamp, which SHOULD be used as the epoch for all future chunks sent from this endpoint.
> This may be 0, or some arbitrary value.
> To synchronize multiple chunkstreams, the endpoint may wish to send the current value of the other chunkstream’s timestamp.

* 今後送られることになるすべてのチャンクのタイムスタンプの基準として使われる**べきである**.
* これは 0 でもよいし, 何らかの任意の値でもよい.
* 複数のチャンクの同期のために, 現在のタイムスタンプを送信したりすることにも使える.

2. ゼロ埋め(4 bytes)

> This field MUST be all 0s.

* すべて 0 で**なければならない**.

とされているが, 2019 年現在ここには利用している Flash Player/Adobe Media Server のバージョンが割り当てられている. 以下に各 OSS 製品の該当部分の実装を示す.

C1 チャンクの場合:

FFmpeg/rtmpproto.c#L1200-L1207[^FFmpeg/rtmpproto.c#L1200-L1207]

```c
uint8_t tosend    [RTMP_HANDSHAKE_PACKET_SIZE+1] = {
    3,                // unencrypted data
    0, 0, 0, 0,       // client uptime
    RTMP_CLIENT_VER1,
    RTMP_CLIENT_VER2,
    RTMP_CLIENT_VER3,
    RTMP_CLIENT_VER4,
};
```

FFmpeg/rtmp.h#L32-L41[^FFmpeg/rtmp.h#L32-L41]

```c
/**
 * emulated Flash client version - 9.0.124.2 on Linux
 * @{
 */
#define RTMP_CLIENT_PLATFORM "LNX"
#define RTMP_CLIENT_VER1    9
#define RTMP_CLIENT_VER2    0
#define RTMP_CLIENT_VER3  124
#define RTMP_CLIENT_VER4    2
/** @} */ //version defines
```

obs-studio/handshake.h#L842-L865[^obs-studio/handshake.h#L842-L865]

```c
if (FP9HandShake)
{
    /* set version to at least 9.0.115.0 */
    if (encrypted)
    {
        clientsig[4] = 128;
        clientsig[6] = 3;
    }
    else
    {
        clientsig[4] = 10;
        clientsig[6] = 45;
    }
    clientsig[5] = 0;
    clientsig[7] = 2;

    RTMP_Log(RTMP_LOGDEBUG, "%s: Client type: %02X", __FUNCTION__, clientsig[-1]);
    getdig = digoff[offalg];
    getdh  = dhoff[offalg];
}
else
{
    memset(&clientsig[4], 0, 4);
}
```

S1 チャンクの場合:

red5-server/InboundHandshake.java#L337-L341[^red5-server/InboundHandshake.java#L337-L341]

```java
// version 4
handshakeBytes[4] = 4;
handshakeBytes[5] = 0;
handshakeBytes[6] = 0;
handshakeBytes[7] = 1;
```

これは, Flash Player 9 および Adobe Media Server 3 前後でハンドシェイクの手順や実装内容に変更が加えられているため, どのバージョンのハンドシェイクを利用するかを区別するために存在する.

3. ランダムなバイト列(1528 bytes)

> This field can contain any arbitrary values.
> Since each endpoint has to distinguish between the response to the handshake it has initiated and the handshake initiated by its peer, this data SHOULD send something sufficiently random.
> But there is no need for cryptographically-secure randomness, or even dynamic values.

* このフィールドはあらゆる任意の値を含むことができる.
* 送受信する相手を区別しなければいけないため, このフィールドの値は十分にランダムである**べき**だが, それが暗号的に安全であったり動的な値である必要はない. 

<a name="fp9"></a>
とされているが, 2019 年現在これは単にランダムな値ではなく, Flash Player 9 および Adobe Media Server 3 以降は送信時に HMAC-SHA256 のダイジェストを埋め込むようになっている. ダイジェストの位置は C0 チャンクおよび S0 チャンクで指定された RTMP のバージョンによって差異がある.  
それらの位置はそれぞれ以下の計算式で求めることができる.

ランダムなバイト列を$R$とおく.

RTMP(3) の場合:

$\displaystyle\sum_{i=0}^4 R_{i}\mod 728 + 12$

RTMPE(6, 8 および 9) の場合:

$\displaystyle\sum_{i=764}^4 R_{i}\mod 728 + 776$

ここで, ダイジェスト生成に使う鍵はクライアント/サーバ側でそれぞれ以下の通りである.

クライアント側:

* C1 チャンクの送信時

"Genuine Adobe Flash Player 001"

* 返送された C1 チャンクの受信時

"Genuine Adobe Flash Player 001 **0x**F0EEC24A8068BEE82E00D0D1029E7E576EEC5D2D29806FAB93B8E636CFEB31AE"

サーバ側:

* S1 チャンクの送信時

"Genuine Adobe Flash Media Server 001"

* 返送された S1 チャンクの受信時

"Genuine Adobe Flash Media Server 001 **0x**F0EEC24A8068BEE82E00D0D1029E7E576EEC5D2D29806FAB93B8E636CFEB31AE"

#### C2 チャンクおよび S2 チャンク

1. タイムスタンプ(4 bytes)

> This field MUST contain the timestamp sent by the peer in S1 (for C2) or C1 (for S2).

* このフィールドはお互いに相手の第一チャンクが**送られた**時点のタイムスタンプを含め**なければならない**.

2. タイムスタンプ(4 bytes)

> This field MUST contain the timestamp at which the previous packet(s1 or c1) sent by the peer was read.

* このフィールドはお互いに相手から送られた第一チャンクを**読み込んだ**時点のタイムスタンプを含め**なければならない**.

3. ランダムなバイト列の**エコー**(1528 bytes)

> This field MUST contain the random data field sent by the peer in S1 (for C2) or S2 (for C1).
> Either peer can use the time and time2 fields together with the current timestamp as a quick estimate of the bandwidth and/or latency of the connection, but this is unlikely to be useful.

* このフィールドは C2 チャンクの場合は S1 チャンクによって送られたランダムなバイト列を, C1 チャンクの場合は S2 チャンクによって送られたランダムなバイト列を含め**なければならない**.
* どちら側も 2 つのタイムスタンプを接続の帯域幅や待ち時間の簡易な見積もりとして使えるが, あまり役に立たない.

公式ドキュメントの文言だけではわかりにくいが, 各種 OSS 製品の実装の中にその答えがあったので以下に示す.

クライアント側の場合:

FFmpeg/rtmpproto.c#L1248-L1258[^FFmpeg/rtmpproto.c#L1248-L1258]

```c
if ((ret = ffurl_read_complete(rt->stream, serverdata,
                               RTMP_HANDSHAKE_PACKET_SIZE + 1)) < 0) {
    av_log(s, AV_LOG_ERROR, "Cannot read RTMP handshake response\n");
    return ret;
}

if ((ret = ffurl_read_complete(rt->stream, clientdata,
                               RTMP_HANDSHAKE_PACKET_SIZE)) < 0) {
    av_log(s, AV_LOG_ERROR, "Cannot read RTMP handshake response\n");
    return ret;
}
```

obs-studio/rtmp.c#L4089-L4112[^obs-studio/rtmp.c#L4089-L4112]

```c
if (ReadN(r, serversig, RTMP_SIG_SIZE) != RTMP_SIG_SIZE)
    return FALSE;

/* decode server response */

memcpy(&suptime, serversig, 4);
suptime = ntohl(suptime);

RTMP_Log(RTMP_LOGDEBUG, "%s: Server Uptime : %d", __FUNCTION__, suptime);
RTMP_Log(RTMP_LOGDEBUG, "%s: FMS Version   : %d.%d.%d.%d", __FUNCTION__,
         serversig[4], serversig[5], serversig[6], serversig[7]);

/* 2nd part of handshake */
if (!WriteN(r, serversig, RTMP_SIG_SIZE))
    return FALSE;

if (ReadN(r, serversig, RTMP_SIG_SIZE) != RTMP_SIG_SIZE)
    return FALSE;

bMatch = (memcmp(serversig, clientsig, RTMP_SIG_SIZE) == 0);
if (!bMatch)
{
    RTMP_Log(RTMP_LOGWARNING, "%s, client signature does not match!", __FUNCTION__);
}
```

obs-studio/handshake.h#L936-L945[^obs-studio/handshake.h#L936-L945]
obs-studio/handshake.h#L1078-L1083[^obs-studio/handshake.h#L1078-L1083]
obs-studio/handshake.h#L1170-L1174[^obs-studio/handshake.h#L1170-L1174]

```c
if (ReadN(r, (char *)serversig, RTMP_SIG_SIZE) != RTMP_SIG_SIZE)
    return FALSE;

/* decode server response */
memcpy(&uptime, serversig, 4);
uptime = ntohl(uptime);

RTMP_Log(RTMP_LOGDEBUG, "%s: Server Uptime : %d", __FUNCTION__, uptime);
RTMP_Log(RTMP_LOGDEBUG, "%s: FMS Version   : %d.%d.%d.%d", __FUNCTION__, serversig[4],
         serversig[5], serversig[6], serversig[7]);

// 中略

if (!WriteN(r, (char *)reply, RTMP_SIG_SIZE))
    return FALSE;

/* 2nd part of handshake */
if (ReadN(r, (char *)serversig, RTMP_SIG_SIZE) != RTMP_SIG_SIZE)
    return FALSE;

// 中略

if (memcmp(serversig, clientsig, RTMP_SIG_SIZE) != 0)
{
    RTMP_Log(RTMP_LOGWARNING, "%s: client signature does not match!",
             __FUNCTION__);
}
```

サーバ側の場合:

FFmpeg/rtmpproto.c#L1452-L1472[^FFmpeg/rtmpproto.c#L1452-L1472]

```c
/* Send S1 */
/* By now same epoch will be sent */
hs_my_epoch = hs_epoch;
/* Generate random */
for (randomidx = 8; randomidx < (RTMP_HANDSHAKE_PACKET_SIZE);
     randomidx += 4)
    AV_WB32(hs_s1 + randomidx, av_get_random_seed());

ret = rtmp_send_hs_packet(rt, hs_my_epoch, 0, hs_s1,
                          RTMP_HANDSHAKE_PACKET_SIZE);
if (ret) {
    av_log(s, AV_LOG_ERROR, "RTMP Handshake S1 Error\n");
    return ret;
}
/* Send S2 */
ret = rtmp_send_hs_packet(rt, hs_epoch, 0, hs_c1,
                          RTMP_HANDSHAKE_PACKET_SIZE);
if (ret) {
    av_log(s, AV_LOG_ERROR, "RTMP Handshake S2 Error\n");
    return ret;
}
```

obs-studio/rtmp.c#L4152-L4178[^obs-studio/rtmp.c#L4152-L4178]

```c
if (!WriteN(r, serverbuf, RTMP_SIG_SIZE + 1))
    return FALSE;

if (ReadN(r, clientsig, RTMP_SIG_SIZE) != RTMP_SIG_SIZE)
    return FALSE;

/* decode client response */

memcpy(&uptime, clientsig, 4);
uptime = ntohl(uptime);

RTMP_Log(RTMP_LOGDEBUG, "%s: Client Uptime : %d", __FUNCTION__, uptime);
RTMP_Log(RTMP_LOGDEBUG, "%s: Player Version: %d.%d.%d.%d", __FUNCTION__,
         clientsig[4], clientsig[5], clientsig[6], clientsig[7]);

/* 2nd part of handshake */
if (!WriteN(r, clientsig, RTMP_SIG_SIZE))
    return FALSE;

if (ReadN(r, clientsig, RTMP_SIG_SIZE) != RTMP_SIG_SIZE)
    return FALSE;

bMatch = (memcmp(serversig, clientsig, RTMP_SIG_SIZE) == 0);
if (!bMatch)
{
    RTMP_Log(RTMP_LOGWARNING, "%s, client signature does not match!", __FUNCTION__);
}
```

obs-studio/hansdhake.h#L1442-L1447[^obs-studio/handshake.h#L1442-L1447]
obs-studio/handshake.h#L1524-L1528[^obs-studio/handshake.h#L1524-L1528]

```c
if (!WriteN(r, (char *)clientsig, RTMP_SIG_SIZE))
    return FALSE;

/* 2nd part of handshake */
if (ReadN(r, (char *)clientsig, RTMP_SIG_SIZE) != RTMP_SIG_SIZE)
    return FALSE;

// 中略

if (memcmp(serversig, clientsig, RTMP_SIG_SIZE) != 0)
{
    RTMP_Log(RTMP_LOGWARNING, "%s: client signature does not match!",
             __FUNCTION__);
}
```

red5-server/InboundHandshake.java#L202-L213[^red5-server/InboundHandshake.java#L202-L213]
red5-server/InboundHandshake.java#L293-L295[^red5-server/InboundHandshake.java#L293-L295]

```java
IoBuffer s0s1s2 = IoBuffer.allocate(Constants.HANDSHAKE_SIZE * 2 + 1); // 3073
// set handshake with encryption type
s0s1s2.put(handshakeType); // 1
s0s1s2.put(s1); // 1536
s0s1s2.put(c1); // 1536
s0s1s2.flip();
// clear original base bytes
handshakeBytes = null;
if (log.isTraceEnabled()) {
    log.trace("S0+S1+S2 size: {}", s0s1s2.limit());
}
return s0s1s2;

// 中略

if (!Arrays.equals(s1, c2)) {
    log.info("Client signature doesn't match!");
}
```

用いているプログラミング言語の違い等によって実装内容に差異はあるものの, 上記の各種実装を参考にすると以下に要約できる.

* C2 チャンク: S1 チャンクと同じ内容を書き込み, 送信する.
* S2 チャンク: C1 チャンクと同じ内容を書き込み, 送信する.

ただし, Flash Player 9 および Adobe Media Server 3 以上の場合は C1 チャンクおよび S1 チャンクのランダムバイト列の所定の位置を HMAC-SHA256 で求めたダイジェストに置き換えて送受信を行い, 受信時に[ダイジェストの位置を探し当てて](#fp9)送信前のダイジェストと照合することでメッセージの正当性を検証する必要がある.

上記の各実装より, 現在の RTMP 層におけるハンドシェイクの手順は以下に要約できる.

<div id="rtmp-handshake-sequences-current">

!!!include(handshake-sequences-current.md)!!!

</div>

図3. 現在の RTMP ハンドシェイクの手順 {#caption-rtmp-handshake-sequences-current}

1. クライアント側はサーバ側に C0 チャンクと C1 チャンクをそれぞれ送信する.
2. サーバ側はクライアント側から C0 チャンク と C1 チャンクをそれぞれ受信したなら, S0 チャンク, S1 チャンクおよび S2 チャンクをそれぞれクライアント側に送信する.
3. クライアント側はサーバ側から S0 チャンク, S1 チャンクおよび S2 チャンクをそれぞれ受信したなら, C2 チャンクをサーバ側へ送信する.
4. サーバ側はクライアント側から C2 チャンクを受け取ったなら, アプリケーション接続に移行する.

### Invoke(connect) から映像データの受信まで

RTMP 層におけるハンドシェイクが完了したなら, サーバ側とクライアント側は映像の送受信に必要な情報を相互に伝達しあう. それは以下の手順で行う.

<div id="rtmp-application-connect-sequences">

!!!include(application-connect-sequences.md)!!!

</div>

図4. アプリケーション接続の大まかなシーケンス {#caption-rtmp-application-connect-sequences}

1. クライアント側はサーバ側に Invoke(connect) メッセージを送信する.
2. サーバ側はクライアント側から受信した Invoke(connect) メッセージをデコードし, 応答メッセージをクライアント側に送信する.
3. クライアント側はサーバ側から Invoke(\_result) を受信したなら, Invoke(createStream) メッセージをサーバ側に送信し, メッセージストリームへの一意な ID の付番を要求する.
4. サーバ側はクライアント側から受信した Invoke(createStream) メッセージをデコードし, 応答メッセージをクライアント側に送信する.
5. クライアント側はサーバ側から Invoke(\_result) を受信したなら, Invoke(publish) をサーバ側に送信し, 映像の送信開始を伝える.
6. サーバ側はクライアント側から受信した Invoke(publish) をデコードし, 応答メッセージをクライアント側に送信する.
7. クライアント側はサーバ側から Invoke(onStatus) を受信したなら, 映像/音声の送信を開始する.

なお, RTMP ハンドシェイク以降に送受信されるチャンクの構造は以下の通りである. ここから Big Endian と Little Endian の違いを考慮していく必要があるので注意が必要である.

#### メッセージチャンクの構造

ハンドシェイク後に送受信されるチャンクは公式ドキュメント[^RTMP-Specification-1.0]では以下のように定義されている.

1. チャンクベーシックヘッダ (最大 3 bytes)

* チャンクメッセージヘッダのフォーマット (2 **bits**)
  * 後に続くチャンクメッセージヘッダのパターンを入力する.
  * 0b00: Type 0 (11 bytes)
  * 0b01: Type 1 (7 bytes)
  * 0b10: Type 2 (3 bytes)
  * 0b11: Type 3 (0 byte)
* チャンクストリーム ID (6 **bits**, 1 byte および 2 bytes)
  * チャンクメッセージの**種類**に応じて割り当てられる. 一意になるとは限らない.
  * ID が 3 以上 63 以下である場合は 6 bits に収めて 1 byte にまとめる.
  * 64 以上 319 以下である場合は 1 byte で表現する. その場合はフォーマット直後の 6 bits には 0 を入力する.
  * 320 以上 65599 以下である場合は 2 bytes で表現する. その場合はフォーマット直後の 6 bits には 1 を入力する.
  * 64 以上の場合は実際の ID よりも 64 少ないものとして扱われるため, デコード後に 64 を加えてから利用する必要がある.
  * 320 以上の場合に限り当該 ID のバイト順序が **Little Endian** であるため, このパターンをデコードする際は更に注意しなければならない.
  * なお, 3 未満の ID は予約済みである.

2. チャンクメッセージヘッダ (最大 11 bytes. 0 byte を含む.)

チャンクメッセージヘッダのパターンは, 上述のチャンクベーシックヘッダの上位 2 bits の値に応じて以下の 4 パターンに分けられる.

Type 0 (11 bytes):

チャンクストリームの始まりはこの Type 0 パターンで**なければならない**.

* タイムスタンプ (3 bytes)
  * チャンクストリームの送信を開始した時点のタイムスタンプを入力する.
  * タイムスタンプが 0xFFFFFF より大きくなる場合は後述の拡張タイムスタンプフィールドに入力し, このフィールドの値を 0xFFFFFF で固定する.
* メッセージ長 (3 bytes)
  * チャンクデータの長さを入力する. ただし, チャンクデータ自体の長さしか考慮されていない. (詳細は後述する)
* メッセージ種類 ID (1 byte)
  * 後に続くチャンクデータの種類を入力する. 現在仕様書に存在している, または利用が確認されている種類は[メッセージの種類](#メッセージの種類)を参照.
* メッセージストリーム ID (4 bytes)
  * アプリケーション間接続が完全に成功した際にサーバ側から割り振られる.
  * チャンクストリームの中ではこの ID を利用して相互に存在を保証しあうため, 一意である必要がある.
  * **Little Endian**である.

Type 1 (7 bytes):

直前のチャンクとメッセージストリーム ID のみが同一である場合はこの Type 1 パターンを入力する.  
音声・映像チャンク等の可変かつ複数のデータを同時に送信するような場合は, 2 番目に送るチャンクのチャンクメッセージヘッダをこの Type 1 パターンに**すべきである**.

* タイムスタンプ (3 bytes)
  * Type 0 パターンが送られた時点からのタイムスタンプの**差分**を入力する.
  * Type 0 パターンと同様に, 0xFFFFFF より大きくなる場合は拡張タイムスタンプを利用する.
* メッセージ長 (3 bytes)
  * Type 0 パターンと同様である.
* メッセージ種類 ID (1 byte)
  * Type 0 パターンと同様である.

Type 2 (3 bytes):

直前のチャンクとメッセージストリーム ID, チャンクデータの種類およびチャンクデータのメッセージ長が同一である場合はこの Type 2 パターンを入力する.  
固定長の同一の種類のチャンクデータを同じメッセージストリームに送信し続けるような場合は, 2 番目に送るチャンクのチャンクメッセージヘッダをこの Type 2 パターンに**すべきである**.

* タイムスタンプ (3 bytes)
  * Type 1 パターンと同様の**差分**である.
  * タイムスタンプが 0xFFFFFF より大きくなる場合も Type 1 と同様にする.

Type 3 (0 byte):

この Type 3 パターンを入力する時は, 以下の 2 つの場合がある:

* 同一のメッセージストリームに種類もサイズも同一のチャンクデータを同時に送信する場合.
  * チャンクデータの内容まで同一である必要はない.
* チャンクデータが所定のチャンクサイズより大きくなってしまった場合.
  * 所定のチャンクサイズ分のチャンクデータの直後に入力する.

特に後者で扱う場合は注意が必要である. その理由は以下の通りである:

* チャンクメッセージヘッダのメッセージ長フィールドにおいて, クライアント側もサーバ側もチャンクデータを区切っている Type 3 ヘッダの数は考慮されて**いない**ため.
  * つまり, チャンクメッセージヘッダのメッセージ長フィールドをチャンクデータを読み取るための数としてそのまま使おうとすると, **チャンクデータの総量が所定のチャンクサイズを超えている場合に正しく読み取れない**.
* また, サーバ側もクライアント側もチャンクメッセージヘッダのメッセージ長フィールドの値とは別に Type 3 パターンのチャンクメッセージヘッダで区切られているチャンクデータを繋げる処理を独自に実装してしまっている.
  * 送信時に入力する Type 3 パターンのチャンクメッセージヘッダの数を当該フィールドに含めても**エラー**扱いされてしまう.

上記の解決手段については別記事で紹介する.

3. 拡張タイムスタンプ (4 bytes)

入力するタイムスタンプが 0xFFFFFF より大きくなった場合に, そのタイムスタンプをチャンクメッセージヘッダのタイムスタンプフィールドに入力する代わりに当該フィールドに入力する.  
タイムスタンプを拡張する必要がない場合はこのフィールドは入力されないため, 無視してチャンクデータを読むように実装する必要もある.

4. チャンクデータ (可変)

チャンクの本文である. 内容はチャンクメッセージヘッダのメッセージ種類 ID フィールドおよびメッセージ長フィールドの値に依存しているほか, 以下の点にも気をつけなければならない.

* メッセージの種類が同じであっても, チャンクデータの内容も同じであるとは限らない.
* チャンクデータの長さが所定のチャンクサイズより大きくなる場合はチャンクデータをそのチャンクサイズ毎に区切り, 残りの各チャンクデータにチャンクベーシックヘッダおよび Type 3 パターンのチャンクメッセージヘッダを添えてから送信すべきである.

##### メッセージの種類

!!!include(message-types.md)!!!

##### User Control Message の種類とデータ

以下は公式ドキュメントに記載されており, 既存 OSS 製品の実装にも見られるイベントである.

!!!include(user-control-events-common.md)!!!

以下は公式ドキュメントには記載されていないが, 既存 OSS 製品の実装で見られるイベントである.

!!!include(user-control-events-oss.md)!!!

以下は公式ドキュメントには記載されておらず, Red5 と OBS の実装で見られるイベントである.

!!!include(user-control-events-red5-obs.md)!!!

##### Metadata の構造

Metadata は公式ドキュメント[^RTMP-Specification-1.0]では以下のように定義されている.

!!!include(metadata-official.md)!!!

一方で, 各種 OSS 製品では以下のようにデコードしている.

!!!include(metadata-oss.md)!!!

#### Invoke(connect)

Invoke(connect) およびその応答メッセージは公式ドキュメント[^RTMP-Specification-1.0]では以下のように定義されている.

要求メッセージ:

!!!include(invoke-connect-request.md)!!!

応答メッセージ:

!!!include(invoke-connect-response.md)!!!

コマンドオブジェクト:

!!!include(command-object.md)!!!

サポートしている音声コーデック:

!!!include(command-object-audio-codecs.md)!!!

サポートしている映像コーデック:

!!!include(command-object-video-codecs.md)!!!

サポートしているビデオ機能:

!!!include(command-object-video-function.md)!!!

サポートしているエンコーディングメソッド:

!!!include(command-object-object-encoding.md)!!!

応答メッセージのプロパティフィールドおよびインフォメーションフィールドには公式に定められた仕様が存在しない. よって, 各種 OSS 製品の実装内容から特定できる範囲で紹介する.

FFmpeg/rtmpproto.c#L542-L575[^FFmpeg/rtmpproto.c#L542-L575]

```c
// Send _result NetConnection.Connect.Success to connect
if ((ret = ff_rtmp_packet_create(&pkt, RTMP_SYSTEM_CHANNEL,
                                 RTMP_PT_INVOKE, 0,
                                 RTMP_PKTDATA_DEFAULT_SIZE)) < 0)
    return ret;

p = pkt.data;
ff_amf_write_string(&p, "_result");
ff_amf_write_number(&p, seqnum);

ff_amf_write_object_start(&p);
ff_amf_write_field_name(&p, "fmsVer");
ff_amf_write_string(&p, "FMS/3,0,1,123");
ff_amf_write_field_name(&p, "capabilities");
ff_amf_write_number(&p, 31);
ff_amf_write_object_end(&p);

ff_amf_write_object_start(&p);
ff_amf_write_field_name(&p, "level");
ff_amf_write_string(&p, "status");
ff_amf_write_field_name(&p, "code");
ff_amf_write_string(&p, "NetConnection.Connect.Success");
ff_amf_write_field_name(&p, "description");
ff_amf_write_string(&p, "Connection succeeded.");
ff_amf_write_field_name(&p, "objectEncoding");
ff_amf_write_number(&p, 0);
ff_amf_write_object_end(&p);

pkt.size = p - pkt.data;
ret = ff_rtmp_packet_write(rt->stream, &pkt, rt->out_chunk_size,
                           &rt->prev_pkt[1], &rt->nb_prev_pkt[1]);
ff_rtmp_packet_destroy(&pkt);
if (ret < 0)
    return ret;
```

プロパティ:

!!!include(invoke-connect-response-properties.md)!!!

インフォメーション:

!!!include(invoke-connect-response-informations.md)!!!

そして, 当該チャンクの送受信の手順は公式ドキュメント[^RTMP-Specification-1.0]では以下のように定義されている.

<div id="rtmp-invoke-connect-sequences-official">

!!!include(invoke-connect-sequences-official.md)!!!

</div>

図5. 公式が説明している Invoke(connect) のシーケンス {#caption-rtmp-invoke-connect-sequences-official}

> The message flow during the execution of the command is:
>
> 1. Client sends the connect command to the server to request to connect with the server application instance.
> 2. After receiving the connect command, the server sends the protocol message ’Window Acknowledgement Size’ to the client. The server also connects to the application mentioned in the connect command.
> 3. The server sends the protocol message ’Set Peer Bandwidth’ to the client.
> 4. The client sends the protocol message ’Window Acknowledgement Size’ to the server after processing the protocol message ’Set Peer Bandwidth’.
> 5. The server sends an another protocol message of type User Control Message(StreamBegin) to the client.
> 6. The server sends the result command message informing the client of the connection status (success/fail). The command specifies the transaction ID (always equal to 1 for the connect command). The message also specifies the properties, such as Flash Media Server version (string). In addition it specificies other connection response related information like level (string), code (string), description (string), objectencoding (number), etc.

* クライアント側はサーバ側のアプリケーションとの接続を要求するために, サーバ側に Invoke(connect) を送信する.
* Invoke(connect) の受信後, サーバ側は プロトコルメッセージ Window Acknowledgement Size / Client BandWidth をクライアント側に送信する. サーバ側もまた connect コマンドで指定されたアプリケーションに接続する.
* サーバ側はクライアント側にプロトコルメッセージ Set Peer BandWidth / Client BandWidth をクライアント側に送信する.
* Set Peer BandWidth / Client BandWidth の処理後に, クライアント側はサーバ側にプロトコルメッセージ Window Acknowledgement Size / Server BandWidth を送信する.
* サーバ側はクライアント側に他のプロトコルメッセージである User Control(Stream Begin) を送信する.
* サーバ側はクライアント側にクライアント側の接続状態を通知する Invoke(\_result) を送信する.

以下に FFmpeg が実際に送信しているメッセージを示す.

FFmpeg/rtmpproto.c#L485-L588[^FFmpeg/rtmpproto.c#L485-L588]

```c
// Send Window Acknowledgement Size (as defined in specification)
if ((ret = ff_rtmp_packet_create(&pkt, RTMP_NETWORK_CHANNEL,
                                 RTMP_PT_WINDOW_ACK_SIZE, 0, 4)) < 0)
    return ret;
p = pkt.data;
// Inform the peer about how often we want acknowledgements about what
// we send. (We don't check for the acknowledgements currently.)
bytestream_put_be32(&p, rt->max_sent_unacked);
pkt.size = p - pkt.data;
ret = ff_rtmp_packet_write(rt->stream, &pkt, rt->out_chunk_size,
                           &rt->prev_pkt[1], &rt->nb_prev_pkt[1]);
ff_rtmp_packet_destroy(&pkt);
if (ret < 0)
    return ret;
// Set Peer Bandwidth
if ((ret = ff_rtmp_packet_create(&pkt, RTMP_NETWORK_CHANNEL,
                                 RTMP_PT_SET_PEER_BW, 0, 5)) < 0)
    return ret;
p = pkt.data;
// Tell the peer to only send this many bytes unless it gets acknowledgements.
// This could be any arbitrary value we want here.
bytestream_put_be32(&p, rt->max_sent_unacked);
bytestream_put_byte(&p, 2); // dynamic
pkt.size = p - pkt.data;
ret = ff_rtmp_packet_write(rt->stream, &pkt, rt->out_chunk_size,
                           &rt->prev_pkt[1], &rt->nb_prev_pkt[1]);
ff_rtmp_packet_destroy(&pkt);
if (ret < 0)
    return ret;

// User control
if ((ret = ff_rtmp_packet_create(&pkt, RTMP_NETWORK_CHANNEL,
                                 RTMP_PT_USER_CONTROL, 0, 6)) < 0)
    return ret;

p = pkt.data;
bytestream_put_be16(&p, 0); // 0 -> Stream Begin
bytestream_put_be32(&p, 0); // Stream 0
ret = ff_rtmp_packet_write(rt->stream, &pkt, rt->out_chunk_size,
                           &rt->prev_pkt[1], &rt->nb_prev_pkt[1]);
ff_rtmp_packet_destroy(&pkt);
if (ret < 0)
    return ret;

// Chunk size
if ((ret = ff_rtmp_packet_create(&pkt, RTMP_NETWORK_CHANNEL,
                                 RTMP_PT_CHUNK_SIZE, 0, 4)) < 0)
    return ret;

p = pkt.data;
bytestream_put_be32(&p, rt->out_chunk_size);
ret = ff_rtmp_packet_write(rt->stream, &pkt, rt->out_chunk_size,
                           &rt->prev_pkt[1], &rt->nb_prev_pkt[1]);
ff_rtmp_packet_destroy(&pkt);
if (ret < 0)
    return ret;

// Send _result NetConnection.Connect.Success to connect
if ((ret = ff_rtmp_packet_create(&pkt, RTMP_SYSTEM_CHANNEL,
                                 RTMP_PT_INVOKE, 0,
                                 RTMP_PKTDATA_DEFAULT_SIZE)) < 0)
    return ret;

p = pkt.data;
ff_amf_write_string(&p, "_result");
ff_amf_write_number(&p, seqnum);

ff_amf_write_object_start(&p);
ff_amf_write_field_name(&p, "fmsVer");
ff_amf_write_string(&p, "FMS/3,0,1,123");
ff_amf_write_field_name(&p, "capabilities");
ff_amf_write_number(&p, 31);
ff_amf_write_object_end(&p);

ff_amf_write_object_start(&p);
ff_amf_write_field_name(&p, "level");
ff_amf_write_string(&p, "status");
ff_amf_write_field_name(&p, "code");
ff_amf_write_string(&p, "NetConnection.Connect.Success");
ff_amf_write_field_name(&p, "description");
ff_amf_write_string(&p, "Connection succeeded.");
ff_amf_write_field_name(&p, "objectEncoding");
ff_amf_write_number(&p, 0);
ff_amf_write_object_end(&p);

pkt.size = p - pkt.data;
ret = ff_rtmp_packet_write(rt->stream, &pkt, rt->out_chunk_size,
                           &rt->prev_pkt[1], &rt->nb_prev_pkt[1]);
ff_rtmp_packet_destroy(&pkt);
if (ret < 0)
    return ret;

if ((ret = ff_rtmp_packet_create(&pkt, RTMP_SYSTEM_CHANNEL,
                                 RTMP_PT_INVOKE, 0, 30)) < 0)
    return ret;
p = pkt.data;
ff_amf_write_string(&p, "onBWDone");
ff_amf_write_number(&p, 0);
ff_amf_write_null(&p);
ff_amf_write_number(&p, 8192);
pkt.size = p - pkt.data;
ret = ff_rtmp_packet_write(rt->stream, &pkt, rt->out_chunk_size,
                           &rt->prev_pkt[1], &rt->nb_prev_pkt[1]);
ff_rtmp_packet_destroy(&pkt);
```

<div id="rtmp-invoke-connect-sequences-ffmpeg">

!!!include(invoke-connect-sequences-ffmpeg.md)!!!

</div>

図6. FFmpeg が行っている Invoke(connect) のシーケンス {#caption-rtmp-invoke-connect-sequences-ffmpeg}

以下の項目はすべてサーバ側からクライアント側への送信として記述する.

1. Window Acknowledgement Size / Server BandWidth を送信する.
2. Set Peer Bandwidth / Client BandWidth を送信する.
3. User Control(Stream Begin) を送信する.
4. **Chunk Size** を送信する.
5. Invoke(\_result) を送信する.
6. **Invoke(onBWDone)** を送信する.

公式ドキュメントが公開された RTMP 1.0 当時と最新の RTMP クライアント/サーバとで手順に変更があることを確認できる. しかし, どちらの手順もアプリケーション接続に**失敗**する.

公式ドキュメントに従った場合:

そもそも公開当時に対して手順が変更されてしまっているため, 当然に失敗してしまう.

FFmpeg に従った場合:

Invoke(onBWDone) を送信した段階で, FFmpeg が以下のメッセージと共にプロセスを終了してしまうはずである.

> RTMP packet size mismatch N != M

ここで N は Invoke(onBWDone) チャンクのメッセージ長を, M はその直前に送信した Invoke(\_result) チャンクのメッセージ長を指している. 上記のエラーメッセージから考えると, Invoke(\_result) チャンクの受信後にもう一度同じサイズのメッセージを要求している. つまり, 何故か Invoke(\_result) チャンクを**二度**送信しなければならない.  
なお, 上記のエラーメッセージは当該製品中の以下の処理から発されている.

FFmpeg/rtmppkt.c#L238-L244[^FFmpeg/rtmppkt.c#L238-L244]

```c
if (prev_pkt[channel_id].read && size != prev_pkt[channel_id].size) {
    av_log(h, AV_LOG_ERROR, "RTMP packet size mismatch %d != %d\n",
                            size, prev_pkt[channel_id].size);
    ff_rtmp_packet_destroy(&prev_pkt[channel_id]);
    prev_pkt[channel_id].read = 0;
    return AVERROR_INVALIDDATA;
}
```

上記の処理は当該製品中のソースコードにしか存在せず, 他方の RTMP クライアントソフトウェアである OBS のソースコード中には存在しないことを確認できる.

obs-studio/rtmp.c#L3857-L4049[^obs-studio/rtmp.c#L3857-L4049]

よって, 私は Invoke(connect) の応答メッセージの送信手順を以下に変更して再送信を試みた.

<div id="rtmp-invoke-connect-sequences-fixed">

!!!include(invoke-connect-sequences-fixed.md)!!!

</div>

図7. エラーメッセージ対処後の Invoke(connect) のシーケンス {#caption-rtmp-invoke-connect-sequences-fixed}

以下の項目もサーバ側からクライアント側への送信として記述する.

1. **Invoke(\_result)** を送信する.
2. Window Acknowledgement Size / Server BandWidth を送信する.
3. Set Peer Bandwidth / Client BandWidth を送信する.
4. User Control(Stream Begin) を送信する.
5. Chunk Size を送信する.
6. **Invoke(\_result)** を送信する.

すると上記のエラーメッセージは発されなくなったが, 今度は Invoke(onBWDone) チャンクを送信する前の段階で FFmpeg から新たな要求メッセージを受信した. それ(ら)は Invoke(createStream) チャンクとそれに付随して送信される**新仕様の** Invoke メッセージである.

#### Invoke(releaseStream), Invoke(FCPublish), Invoke(createStream)

Invoke(connect) での接続処理が終わった後に, 3 つに繋がった何らかのチャンクを受信する. それらは Invoke(createStream) と各種製品が公式ドキュメントの公開よりも後に実装した要求メッセージである.

1. Invoke(releaseStream)

Invoke(releaseStream) チャンクとその応答メッセージは FFmpeg および OBS によると以下の構造であるようだ.

FFmpeg/rtmpproto.c#L593-L615[^FFmpeg/rtmpproto.c#L593-L615]
FFmpeg/rtmpproto.c#L1981-L1999[^FFmpeg/rtmpproto.c#L1981-L1999]

```c
/**
 * Generate 'releaseStream' call and send it to the server. It should make
 * the server release some channel for media streams.
 */
static int gen_release_stream(URLContext *s, RTMPContext *rt)
{
    RTMPPacket pkt;
    uint8_t *p;
    int ret;

    if ((ret = ff_rtmp_packet_create(&pkt, RTMP_SYSTEM_CHANNEL, RTMP_PT_INVOKE,
                                     0, 29 + strlen(rt->playpath))) < 0)
        return ret;

    av_log(s, AV_LOG_DEBUG, "Releasing stream...\n");
    p = pkt.data;
    ff_amf_write_string(&p, "releaseStream");
    ff_amf_write_number(&p, ++rt->nb_invokes);
    ff_amf_write_null(&p);
    ff_amf_write_string(&p, rt->playpath);

    return rtmp_send_packet(rt, &pkt, 1);
}

// 中略

if ((ret = ff_rtmp_packet_create(&spkt, RTMP_SYSTEM_CHANNEL,
                                 RTMP_PT_INVOKE, 0,
                                 RTMP_PKTDATA_DEFAULT_SIZE)) < 0) {
    av_log(s, AV_LOG_ERROR, "Unable to create response packet\n");
    return ret;
}
pp = spkt.data;
ff_amf_write_string(&pp, "_result");
ff_amf_write_number(&pp, seqnum);
ff_amf_write_null(&pp);
if (!strcmp(command, "createStream")) {
    rt->nb_streamid++;
    if (rt->nb_streamid == 0 || rt->nb_streamid == 2)
        rt->nb_streamid++; /* Values 0 and 2 are reserved */
    ff_amf_write_number(&pp, rt->nb_streamid);
    /* By now we don't control which streams are removed in
     * deleteStream. There is no stream creation control
     * if a client creates more than 2^32 - 2 streams. */
}
```

obs-studio/rtmp.c#L1990-L2016[^obs-studio/rtmp.c#L1990-L2016]

```c
static int
SendReleaseStream(RTMP *r, int streamIdx)
{
    RTMPPacket packet;
    char pbuf[1024], *pend = pbuf + sizeof(pbuf);
    char *enc;

    packet.m_nChannel = 0x03;	/* control channel (invoke) */
    packet.m_headerType = RTMP_PACKET_SIZE_MEDIUM;
    packet.m_packetType = RTMP_PACKET_TYPE_INVOKE;
    packet.m_nTimeStamp = 0;
    packet.m_nInfoField2 = 0;
    packet.m_hasAbsTimestamp = 0;
    packet.m_body = pbuf + RTMP_MAX_HEADER_SIZE;

    enc = packet.m_body;
    enc = AMF_EncodeString(enc, pend, &av_releaseStream);
    enc = AMF_EncodeNumber(enc, pend, ++r->m_numInvokes);
    *enc++ = AMF_NULL;
    enc = AMF_EncodeString(enc, pend, &r->Link.streams[streamIdx].playpath);
    if (!enc)
        return FALSE;

    packet.m_nBodySize = enc - packet.m_body;

    return RTMP_SendPacket(r, &packet, FALSE);
}
```

要求メッセージ:

!!!include(invoke-release-stream-request.md)!!!

応答メッセージ:

!!!include(invoke-release-stream-response.md)!!!

2. Invoke(FCPublish)

Invoke(FCPublish) チャンクとその応答メッセージは FFmpeg および OBS によると以下の構造であるようだ.

FFmpeg/rtmpproto.c#L641-L663[^FFmpeg/rtmpproto.c#L641-L663]
FFmpeg/rtmpproto.c#L1956-L1965[^FFmpeg/rtmpproto.c#L1956-L1965]

```c
/**
 * Generate 'FCPublish' call and send it to the server. It should make
 * the server prepare for receiving media streams.
 */
static int gen_fcpublish_stream(URLContext *s, RTMPContext *rt)
{
    RTMPPacket pkt;
    uint8_t *p;
    int ret;

    if ((ret = ff_rtmp_packet_create(&pkt, RTMP_SYSTEM_CHANNEL, RTMP_PT_INVOKE,
                                     0, 25 + strlen(rt->playpath))) < 0)
        return ret;

    av_log(s, AV_LOG_DEBUG, "FCPublish stream...\n");
    p = pkt.data;
    ff_amf_write_string(&p, "FCPublish");
    ff_amf_write_number(&p, ++rt->nb_invokes);
    ff_amf_write_null(&p);
    ff_amf_write_string(&p, rt->playpath);

    return rtmp_send_packet(rt, &pkt, 1);
}

// 中略

if (!strcmp(command, "FCPublish")) {
    if ((ret = ff_rtmp_packet_create(&spkt, RTMP_SYSTEM_CHANNEL,
                                     RTMP_PT_INVOKE, 0,
                                     RTMP_PKTDATA_DEFAULT_SIZE)) < 0) {
        av_log(s, AV_LOG_ERROR, "Unable to create response packet\n");
        return ret;
    }
    pp = spkt.data;
    ff_amf_write_string(&pp, "onFCPublish");
}
```

obs-studio/rtmp.c#L2020-L2046[^obs-studio/rtmp.c#L2020-L2046]

```c
static int
SendFCPublish(RTMP *r, int streamIdx)
{
    RTMPPacket packet;
    char pbuf[1024], *pend = pbuf + sizeof(pbuf);
    char *enc;

    packet.m_nChannel = 0x03;	/* control channel (invoke) */
    packet.m_headerType = RTMP_PACKET_SIZE_MEDIUM;
    packet.m_packetType = RTMP_PACKET_TYPE_INVOKE;
    packet.m_nTimeStamp = 0;
    packet.m_nInfoField2 = 0;
    packet.m_hasAbsTimestamp = 0;
    packet.m_body = pbuf + RTMP_MAX_HEADER_SIZE;

    enc = packet.m_body;
    enc = AMF_EncodeString(enc, pend, &av_FCPublish);
    enc = AMF_EncodeNumber(enc, pend, ++r->m_numInvokes);
    *enc++ = AMF_NULL;
    enc = AMF_EncodeString(enc, pend, &r->Link.streams[streamIdx].playpath);
    if (!enc)
        return FALSE;

    packet.m_nBodySize = enc - packet.m_body;

    return RTMP_SendPacket(r, &packet, FALSE);
}
```

要求メッセージ:

!!!include(invoke-fcpublish-request.md)!!!

応答メッセージ:

!!!include(invoke-fcpublish-response.md)!!!

3. Invoke(createStream)

Invoke(createStream) チャンクは公式ドキュメント[^RTMP-Specification-1.0]では以下のように定義されている.

要求メッセージ:

!!!include(invoke-create-stream-request-official.md)!!!

応答メッセージ:

!!!include(invoke-create-stream-response-official.md)!!!

一方で, FFmpeg および OBS では以下の構造であるようだ.

FFmpeg/rtmpproto.c#L665-L687[^FFmpeg/rtmpproto.c#L665-L687]
FFmpeg/rtmpproto.c#L1981-L1999[^FFmpeg/rtmpproto.c#L1981-L1999]

```c
/**
 * Generate 'createStream' call and send it to the server. It should make
 * the server allocate some channel for media streams.
 */
static int gen_create_stream(URLContext *s, RTMPContext *rt)
{
    RTMPPacket pkt;
    uint8_t *p;
    int ret;

    av_log(s, AV_LOG_DEBUG, "Creating stream...\n");

    if ((ret = ff_rtmp_packet_create(&pkt, RTMP_SYSTEM_CHANNEL, RTMP_PT_INVOKE,
                                     0, 25)) < 0)
        return ret;

    p = pkt.data;
    ff_amf_write_string(&p, "createStream");
    ff_amf_write_number(&p, ++rt->nb_invokes);
    ff_amf_write_null(&p);

    return rtmp_send_packet(rt, &pkt, 1);
}

// 中略

if ((ret = ff_rtmp_packet_create(&spkt, RTMP_SYSTEM_CHANNEL,
                                 RTMP_PT_INVOKE, 0,
                                 RTMP_PKTDATA_DEFAULT_SIZE)) < 0) {
    av_log(s, AV_LOG_ERROR, "Unable to create response packet\n");
    return ret;
}
pp = spkt.data;
ff_amf_write_string(&pp, "_result");
ff_amf_write_number(&pp, seqnum);
ff_amf_write_null(&pp);
if (!strcmp(command, "createStream")) {
    rt->nb_streamid++;
    if (rt->nb_streamid == 0 || rt->nb_streamid == 2)
        rt->nb_streamid++; /* Values 0 and 2 are reserved */
    ff_amf_write_number(&pp, rt->nb_streamid);
    /* By now we don't control which streams are removed in
     * deleteStream. There is no stream creation control
     * if a client creates more than 2^32 - 2 streams. */
}
```

obs-studio/rtmp.c#L1899-L1922[^obs-studio/rtmp.c#L1899-L1922]

```c
int
RTMP_SendCreateStream(RTMP *r)
{
    RTMPPacket packet;
    char pbuf[256], *pend = pbuf + sizeof(pbuf);
    char *enc;

    packet.m_nChannel = 0x03;	/* control channel (invoke) */
    packet.m_headerType = RTMP_PACKET_SIZE_MEDIUM;
    packet.m_packetType = RTMP_PACKET_TYPE_INVOKE;
    packet.m_nTimeStamp = 0;
    packet.m_nInfoField2 = 0;
    packet.m_hasAbsTimestamp = 0;
    packet.m_body = pbuf + RTMP_MAX_HEADER_SIZE;

    enc = packet.m_body;
    enc = AMF_EncodeString(enc, pend, &av_createStream);
    enc = AMF_EncodeNumber(enc, pend, ++r->m_numInvokes);
    *enc++ = AMF_NULL;		/* NULL */

    packet.m_nBodySize = enc - packet.m_body;

    return RTMP_SendPacket(r, &packet, TRUE);
}
```

要求メッセージ:

!!!include(invoke-create-stream-request-ffmpeg-obs.md)!!!

応答メッセージ:

!!!include(invoke-create-stream-response-ffmpeg-obs.md)!!!

Invoke(releaseStream), Invoke(FCPublish) および Invoke(createStream) の 3 つのチャンクへの応答をすべて終えると, クライアント側はサーバ側に Invoke(publish) チャンクを送信する.

#### Invoke(publish)

Invoke(publish) チャンクは公式ドキュメント[^RTMP-Specification-1.0]では以下のように定義されている.

要求メッセージ:

!!!include(invoke-publish-request-official.md)!!!

応答メッセージ:

!!!include(invoke-publish-response-official.md)!!!

一方で, FFmpeg および OBS では以下の構造であるようだ.

FFmpeg/rtmpproto.c#L838-L863[^FFmpeg/rtmpproto.c#L838-L863]
FFmpeg/rtmpproto.c#L1858-L1899[^FFmpeg/rtmpproto.c#L1858-L1899]

```c
/**
 * Generate 'publish' call and send it to the server.
 */
static int gen_publish(URLContext *s, RTMPContext *rt)
{
    RTMPPacket pkt;
    uint8_t *p;
    int ret;

    av_log(s, AV_LOG_DEBUG, "Sending publish command for '%s'\n", rt->playpath);

    if ((ret = ff_rtmp_packet_create(&pkt, RTMP_SOURCE_CHANNEL, RTMP_PT_INVOKE,
                                     0, 30 + strlen(rt->playpath))) < 0)
        return ret;

    pkt.extra = rt->stream_id;

    p = pkt.data;
    ff_amf_write_string(&p, "publish");
    ff_amf_write_number(&p, ++rt->nb_invokes);
    ff_amf_write_null(&p);
    ff_amf_write_string(&p, rt->playpath);
    ff_amf_write_string(&p, "live");

    return rtmp_send_packet(rt, &pkt, 1);
}

static int write_status(URLContext *s, RTMPPacket *pkt,
                        const char *status, const char *filename)
{
    RTMPContext *rt = s->priv_data;
    RTMPPacket spkt = { 0 };
    char statusmsg[128];
    uint8_t *pp;
    int ret;

    if ((ret = ff_rtmp_packet_create(&spkt, RTMP_SYSTEM_CHANNEL,
                                     RTMP_PT_INVOKE, 0,
                                     RTMP_PKTDATA_DEFAULT_SIZE)) < 0) {
        av_log(s, AV_LOG_ERROR, "Unable to create response packet\n");
        return ret;
    }

    pp = spkt.data;
    spkt.extra = pkt->extra;
    ff_amf_write_string(&pp, "onStatus");
    ff_amf_write_number(&pp, 0);
    ff_amf_write_null(&pp);

    ff_amf_write_object_start(&pp);
    ff_amf_write_field_name(&pp, "level");
    ff_amf_write_string(&pp, "status");
    ff_amf_write_field_name(&pp, "code");
    ff_amf_write_string(&pp, status);
    ff_amf_write_field_name(&pp, "description");
    snprintf(statusmsg, sizeof(statusmsg),
             "%s is now published", filename);
    ff_amf_write_string(&pp, statusmsg);
    ff_amf_write_field_name(&pp, "details");
    ff_amf_write_string(&pp, filename);
    ff_amf_write_object_end(&pp);

    spkt.size = pp - spkt.data;
    ret = ff_rtmp_packet_write(rt->stream, &spkt, rt->out_chunk_size,
                               &rt->prev_pkt[1], &rt->nb_prev_pkt[1]);
    ff_rtmp_packet_destroy(&spkt);

    return ret;
}
```

obs-studio/rtmp.c#L2081-L2112[^obs-studio/rtmp.c#L2081-L2112]

```c
static int
SendPublish(RTMP *r, int streamIdx)
{
    RTMPPacket packet;
    char pbuf[1024], *pend = pbuf + sizeof(pbuf);
    char *enc;

    packet.m_nChannel = 0x04;	/* source channel (invoke) */
    packet.m_headerType = RTMP_PACKET_SIZE_LARGE;
    packet.m_packetType = RTMP_PACKET_TYPE_INVOKE;
    packet.m_nTimeStamp = 0;
    packet.m_nInfoField2 = r->Link.streams[streamIdx].id;
    packet.m_hasAbsTimestamp = 0;
    packet.m_body = pbuf + RTMP_MAX_HEADER_SIZE;

    enc = packet.m_body;
    enc = AMF_EncodeString(enc, pend, &av_publish);
    enc = AMF_EncodeNumber(enc, pend, ++r->m_numInvokes);
    *enc++ = AMF_NULL;
    enc = AMF_EncodeString(enc, pend, &r->Link.streams[streamIdx].playpath);
    if (!enc)
        return FALSE;

    /* FIXME: should we choose live based on Link.lFlags & RTMP_LF_LIVE? */
    enc = AMF_EncodeString(enc, pend, &av_live);
    if (!enc)
        return FALSE;

    packet.m_nBodySize = enc - packet.m_body;

    return RTMP_SendPacket(r, &packet, TRUE);
}
```

要求メッセージ:

!!!include(invoke-publish-request-ffmpeg-obs.md)!!!

応答メッセージ:

!!!include(invoke-publish-response-ffmpeg-obs.md)!!!

Invoke(publish) チャンクの現在の仕様は, 要求メッセージのトランザクション ID が 0 でないことを除き RTMP 1.0 当時と同じようだ.

上記の仕様に従い, クライアント/サーバ側は当該要求/応答チャンクを送信する. その手順は公式ドキュメント[^RTMP-Specification-1.0]では以下のように定義されている.

<div id="rtmp-invoke-publish-sequences-official">

!!!include(invoke-publish-sequences-official.md)!!!

</div>

図7. 公式が説明している Invoke(publish) のシーケンス {#caption-rtmp-invoke-publish-sequences-official}

1. クライアント側はサーバ側に Invoke(publish) チャンクを送信する.
2. サーバ側はクライアント側に User Control(Stream Begin) チャンクを送信する.
3. クライアント側はサーバ側に Metadata チャンク, Audio/Video チャンクおよび Chunk Size チャンクを送信する.
4. サーバ側はクライアント側に Invoke(onStatus) チャンクを送信する.
5. クライアント側はストリームの送信が完了するまでサーバ側に映像/音声データを送信する.

一方で, FFmpeg では以下の実装を行っている.

FFmpeg/rtmpproto.c#L1965-L1973[^FFmpeg/rtmpproto.c#L1965-L1973]

```c
if (!strcmp(command, "publish")) {
    ret = write_begin(s);
    if (ret < 0)
        return ret;

    // Send onStatus(NetStream.Publish.Start)
    return write_status(s, pkt, "NetStream.Publish.Start",
                       filename);
}
```

<div id="rtmp-invoke-publish-sequences-ffmpeg">

!!!include(invoke-publish-sequences-ffmpeg.md)!!!

</div>

図8. FFmpeg が行っている Invoke(publish) のシーケンス {#caption-rtmp-invoke-publish-sequences-ffmpeg}

1. クライアント側はサーバ側に Invoke(publish) チャンクを送信する.
2. サーバ側はクライアント側に User Control(Stream Begin) チャンクと Invoke(onStatus) チャンクを送信する.
3. クライアント側はストリームの送信が完了するまでサーバ側に映像/音声データを送信する.

こちらも RTMP 1.0 当時に対して手順が変わっていることを確認できる. 上記の手順に従い Invoke(onStatus) チャンクの送信を終えると, クライアント側はサーバ側に Metadata チャンクを含めた Audio/Video チャンクの送信を開始する.

ここで, 上記の各種接続手順より現在の RTMP 層で映像/音声データを送受信するまでに必要な手順は以下に要約できる.

### 現在の RTMP 接続の流れ

<div id="rtmp-connection-sequences-current">

!!!include(connection-sequences-current.md)!!!

</div>

図9. RTMP 全体の現在の*大まかな*シーケンス {#caption-rtmp-connection-sequences-current}

1. クライアント側とサーバ側は TCP 層での接続の後, RTMP 層でのハンドシェイクを行う.
   1. クライアント側はサーバ側に C0 チャンクと C1 チャンクを送信する.
   2. サーバ側は, クライアント側から受信した C0 チャンクに入力されたプロトコルのバージョンに対応していれば S0 チャンクと S1 チャンク に C1 チャンクを添えて返送する.
   3. クライアント側は, サーバ側から返送された S0 チャンクに入力されたプロトコルのバージョンに対応しており, C1 チャンクの内容が返送前と同じであれば, S1 チャンクを返送する.
   4. サーバ側は, クライアント側から返送された S1 チャンクの内容が返送前と同じであればアプリケーション間接続を開始する.
   5. Flash Player 9 / Adobe Media Server 3 以降の場合, クライアント/サーバ側は, 返送チャンクの受信時に C1/S1 チャンクに埋め込んだ [HMAC-SHA256 ダイジェスト](#fp9)と所定の鍵で求めたハッシュでも同一性を検証する必要がある.
2. 1 で RTMP 層でのハンドシェイクが成功したなら, アプリケーション間接続に必要な情報を相互に伝達しあう.
   1. クライアント側はサーバ側に Invoke(connect) チャンクを送信する.
   2. サーバ側はクライアント側から受信した Invoke(connect) をデコードし, それが妥当であれば応答チャンクを送信する. 応答チャンクおよびそれに付随する各種チャンクの送信順序は以下の通りである.
      1. Invoke(\_result) チャンク
      2. Window Acknowledgement Size / Server BandWidth チャンク
      3. Set Peer BandWidth / Client BandWidth チャンク
      4. User Control (Stream Begin) チャンク
      5. Chunk Size チャンク
      6. Invoke(\_result) チャンク
   3. クライアント側はサーバ側から応答チャンクを受信したなら, 以下の手順で Invoke(createStream) チャンクとそれに付随するチャンクを同時に送信する.
      1. Invoke(releaseStream) チャンク
      2. Invoke(FCPublish) チャンク
      3. Invoke(createStream) チャンク
   4. サーバ側はクライアント側から受信した上記のチャンクをデコードし, それらが妥当であれば各種応答チャンクを送信し, メッセージに一意な値を付番する.
   5. クライアント側はサーバ側から Invoke(createStream) チャンクに対する応答チャンクを受信したなら, Invoke(publish) チャンクを送信し, サーバ側に映像/音声データの送受信開始を伝える.
   6. サーバ側はクライアント側から受信した Invoke(publish) チャンクをデコードし, それが妥当であれば User Control(StreamBegin) チャンクと Invoke(onStatus) チャンクをクライアント側に送信する.
3. 映像/音声データの送受信を行う.

### パケットのメッセージフォーマット

Invoke, Metadata および Shared Object の 3 種のチャンクデータには, AMF0 もしくは AMF3 のメッセージフォーマットが適用されている. それらの内訳は AMF のドキュメントでは以下のように定義されている.

#### AMF0

* AMF0[^AMF0-File-Format-Specification]

!!!include(amf0-types.md)!!!

#### AMF3

* AMF3[^AMF-File-Format-Spec]

!!!include(amf3-types.md)!!!

## 参考文献

[^RTMP-Specification-1.0]: Adobe Systems Inc., "RTMP Specification 1.0", http://wwwimages.adobe.com/content/dam/Adobe/en/devnet/rtmp/pdf/rtmp_specification_1.0.pdf

[^FFmpeg/rtmpproto.c#L1200-L1236]: FFmpeg, "FFmpeg/rtmpproto.c#L1200-L1236", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmpproto.c#L1200-L1236

[^obs-studio/rtmp.c#L4062]: obsproject, "obs-studio/rtmp.c#L4062", https://github.com/obsproject/obs-studio/blob/23.2.1/plugins/obs-outputs/librtmp/rtmp.c#L4062

[^obs-studio/handshake.h#L831-L837]: obsproject, "obs-studio/handshake.h#L831-L837", https://github.com/obsproject/obs-studio/blob/23.2.1/plugins/obs-outputs/librtmp/handshake.h#L831-L837

[^red5-server-common/RTMPHandshake.java#L56]: Red5, "red5-server-common/RTMPHandshake.java#L56", https://github.com/Red5/red5-server-common/blob/v1.2.2/src/main/java/org/red5/server/net/rtmp/RTMPHandshake.java#L56

[^FFmpeg/rtmpproto.c#L1200-L1207]: FFmpeg, "FFmpeg/rtmpproto.c#L1200-L1207", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmpproto.c#L1200-L1207

[^FFmpeg/rtmp.h#L32-L41]: FFmpeg, "FFmpeg/rtmp.h#L32-L41", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmp.h#L32-L41

[^obs-studio/handshake.h#L842-L865]: obsproject, "obs-studio/handshake.h#L842-L865", https://github.com/obsproject/obs-studio/blob/24.0.6/plugins/obs-outputs/librtmp/handshake.h#L842-L865

[^red5-server/InboundHandshake.java#L337-L341]: Red5, "red5-server/InboundHandshake.java#L337-L341", https://github.com/Red5/red5-server/blob/v1.2.3/src/main/java/org/red5/server/net/rtmp/InboundHandshake.java#L337-L341

[^FFmpeg/rtmpproto.c#L1248-L1258]: FFmpeg, "FFmpeg/rtmpproto.c#L1248-L1258", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmpproto.c#L1248-L1258

[^obs-studio/rtmp.c#L4089-L4112]: obsproject, "obs-studio/rtmp.c#L4089-L4112", https://github.com/obsproject/obs-studio/blob/24.0.6/plugins/obs-outputs/librtmp/rtmp.c#L4089-L4112

[^obs-studio/handshake.h#L936-L945]: obsproject, "obs-studio/handshake.h#L936-L945", https://github.com/obsproject/obs-studio/blob/24.0.6/plugins/obs-outputs/librtmp/handshake.h#L936-L945

[^obs-studio/handshake.h#L1078-L1083]: obsproject, "obs-studio/handshake.h#L1078-L1083", https://github.com/obsproject/obs-studio/blob/24.0.6/plugins/obs-outputs/librtmp/handshake.h#L1078-L1083

[^obs-studio/handshake.h#L1170-L1174]: obsproject, "obs-studio/handshake.h#L1170-L1174", https://github.com/obsproject/obs-studio/blob/24.0.6/plugins/obs-outputs/librtmp/handshake.h#L1170-L10174

[^FFmpeg/rtmpproto.c#L1452-L1472]: FFmpeg, "FFmpeg/rtmpproto.c#L1452-L1472", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmpproto.c#L1452-L1472

[^obs-studio/rtmp.c#L4152-L4178]: obsproject, "obs-studio/rtmp.c#L4152-L4178", https://github.com/obsproject/obs-studio/blob/24.0.6/plugins/obs-outputs/librtmp/rtmp.c#L4152-L4178

[^obs-studio/handshake.h#L1442-L1447]: obsproject, "obs-studio/handshake.h#L1442-L1447", https://github.com/obsproject/obs-studio/blob/24.0.6/plugins/obs-outputs/librtmp/handshake.h#L1442-L1447

[^obs-studio/handshake.h#L1524-L1528]: obsproject, "obs-studio/handshake.h#L1524-L1528", https://github.com/obsproject/obs-studio/blob/24.0.6/plugins/obs-outputs/librtmp/handshake.h#L1524-L1528

[^red5-server/InboundHandshake.java#L202-L213]: Red5, "red5-server/InboundHandshake.java#L202-L213", https://github.com/Red5/red5-server/blob/v1.2.3/src/main/java/org/red5/server/net/rtmp/InboundHandshake.java#L202-L213

[^red5-server/InboundHandshake.java#L293-L295]: Red5, "red5-server/InboundHandshake.java#L293-L295", https://github.com/Red5/red5-server/blob/v1.2.3/src/main/java/org/red5/server/net/rtmp/InboundHandshake.java#L293-L295

[^FFmpeg/rtmpproto.c#L2347-L2395]: FFmpeg, "FFmpeg/rtmpproto.c#L2347-L2395", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmpproto.c#L2347-L2395

[^obs-studio/rtmp.c#L1490-L1523]: obsproject, "obs-studio/rtmp.c#L1490-L1523", https://github.com/obsproject/obs-studio/blob/24.0.6/plugins/obs-outputs/librtmp/rtmp.c#L1490-L1523

[^obs-studio/rtmp.c#L4972-L5059]: obsproject, "obs-studio/rtmp.c#L4972-L5059", https://github.com/obsproject/obs-studio/blob/24.0.6/plugins/obs-outputs/librtmp/rtmp.c#L4972-L5059

[^red5-server-common/Aggregate.java#L108-L198]: Red5, "red5-server-common/Aggregate.java#L108-L198", https://github.com/Red5/red5-server-common/blob/v1.2.2/src/main/java/org/red5/server/net/rtmp/event/Aggregate.java#L108-L198

[^FFmpeg/rtmpproto.c#L542-L575]: FFmpeg, "FFmpeg/rtmpproto.c#L542-L575", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmpproto.c#L542-L575

[^FFmpeg/rtmpproto.c#L485-L588]: FFmpeg, "FFmpeg/rtmpproto.c#L485-L588", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmpproto.c#L485-L588

[^FFmpeg/rtmppkt.c#L238-L244]: FFmpeg, "FFmpeg/rtmppkt.c#L238-L244", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmppkt.c#L238-L244

[^obs-studio/rtmp.c#L3857-L4049]: obsproject, "obs-studio/rtmp.c#L3857-L4049", https://github.com/obsproject/obs-studio/blob/24.0.6/plugins/obs-outputs/librtmp/rtmp.c#L3857-L4049

[^FFmpeg/rtmpproto.c#L593-L615]: FFmpeg, "FFmpeg/rtmpproto.c#L593-L615", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmpproto.c#L593-L615

[^FFmpeg/rtmpproto.c#L1981-L1999]: FFmpeg, "FFmpeg/rtmpproto.c#L1981-L1999", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmpproto.c#L1981-L1999

[^obs-studio/rtmp.c#L1990-L2016]: obsproject, "obs-studio/rtmp.c#L1990-L2016", https://github.com/obsproject/obs-studio/blob/24.0.6/plugins/obs-outputs/librtmp/rtmp.c#L1990-L2016

[^FFmpeg/rtmpproto.c#L641-L663]: FFmpeg, "FFmpeg/rtmpproto.c#L641-L663", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmpproto.c#L641-L663

[^FFmpeg/rtmpproto.c#L1956-L1965]: FFmpeg, "FFmpeg/rtmpproto.c#L1956-L1965", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmpproto.c#L1956-L1965

[^obs-studio/rtmp.c#L2020-L2046]: obsproject, "obs-studio/rtmp.c#L2020-L2046", https://github.com/obsproject/obs-studio/blob/24.0.6/plugins/obs-outputs/librtmp/rtmp.c#L2020-L2046

[^FFmpeg/rtmpproto.c#L665-L687]: FFmpeg, "FFmpeg/rtmpproto.c#L665-L687", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmpproto.c#L665-L687

[^obs-studio/rtmp.c#L1899-L1922]: obsproject, "obs-studio/rtmp.c#L1899-L1922", https://github.com/obsproject/obs-studio/blob/24.0.6/plugins/obs-outputs/librtmp/rtmp.c#L1899-L1922

[^FFmpeg/rtmpproto.c#L838-L863]: FFmpeg, "FFmpeg/rtmpproto.c#L838-L863", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmpproto.c#L838-L863

[^FFmpeg/rtmpproto.c#L1858-L1899]: FFmpeg, "FFmpeg/rtmpproto.c#L1858-L1899", https://github.com/FFmpeg/FFmpeg/blob/n4.2.1/libavformat/rtmpproto.c#L1858-L1899

[^obs-studio/rtmp.c#L2081-L2112]: obsproject, "obs-studio/rtmp.c#L2081-L2112", https://github.com/obsproject/obs-studio/blob/24.0.6/plugins/obs-outputs/librtmp/rtmp.c#L2081-L2112

[^FFmpeg/rtmpproto.c#L1965-L1973]: FFmpeg, "FFmpeg/rtmpproto.c#L1965-L1973", https://github.com/FFmpeg/FFmpeg/blob/n4.2.2/libavformat/rtmpproto.c#L1965-L1973

[^AMF0-File-Format-Specification]: Adobe Systems Inc., "AMF0 File Format Specification", https://www.adobe.com/content/dam/acom/en/devnet/pdf/amf0-file-format-specification.pdf

[^AMF-File-Format-Spec]: Adobe Systems Inc., "AMF File Format Spec", https://www.adobe.com/content/dam/acom/en/devnet/pdf/amf-file-format-spec.pdf

*[OSS]: Open Source Software
*[RTMP]: Real-Time Messaging Protocol
*[RTMPE]: Real-Time Messaging Protocol Encrypted
*[RTMPS]: Real-Time Messaging Protocol over TLS/SSL
*[RTMPT]: Real-Time Messaging Protocol over HTTP
*[RTMPTE]: Real-Time Messaging Protocol Encrypted over HTTP
*[RTMPTS]: Real-Time Messaging Protocol over HTTPS
*[HTTP]: Hyper Text Transfer Protocol
*[HTTPS]: HTTP over SSL
*[TCP]: Transmission Control Protocol
*[DH]: Diffie-Hellman
*[TLS]: Transport Layer Security
*[SSL]: Secure Socket Layer
*[HLS]: HTTP Live Streaming
*[OBS]: Open Broadcaster Software
*[MPEG2-TS]: MPEG2 Transport Straming
*[AVM]: ActionScript Virtual Machine

