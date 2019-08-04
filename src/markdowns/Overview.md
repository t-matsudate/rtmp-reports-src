目次

[[toc]]

## はじめに

私は RTMP サーバを実装するにあたって, まず Adobe Inc. が公式に発行しているドキュメントや既存の OSS 製品を参照した. しかし, それらには以下の問題があることがわかった:

* 公式のドキュメントが 2012 年発行のものと古く, 既存製品の最新の通信手順/通信内容からかけ離れてきている.
  * ブログ等の既出の実装記事/解説記事についても, 時と共に最新の実装や仕様からはかけ離れてしまうという問題がある.
* 既存製品(OSS 製品等目視確認できる範囲に限る)についても実装箇所を整理しにくい部分がある.
* また, 既存製品は用いたプログラミング言語やフレームワークによって実装内容に差異があり, プロトコルで共通化されている部分なのか製品側が独自に実装している部分なのかの区別をつけにくいことがある.

上記を解消する方法の一つとして, 私は自分自身で実装を行いながら, 当該プロトコルのサーバサイド/クライアントサイド両面の概要, 処理手順, 実装内容, およびそれらを解説する情報を随時更新していこうと考えた.

## RTMP とは

RTMP とは, TCP 上で映像や音声の送受信を行うプロトコルの 1 つである. Adobe Inc. によって, 当時の Flash Player および Adobe Media Server 間で帯域の圧迫を避けながら映像/音声パケットを効率よく送受信するためのパケットのフォーマットおよび当該パケットの送受信手順について取り決められている.  
また,  RTMP には同じ手段で通信するものとして以下のような派生プロトコルも存在している.

* RTMPE: 送信側が RTMP のハンドシェイクパケットを DH 暗号により暗号化してから通信を行うプロトコルである. ただし, あくまでパケットの暗号化であり通信経路自体は保護されていないため, 中間者攻撃等によりパケットごとすり替えられる脆弱性が存在する.
* RTMPS: RTMP に TLS/SSL による暗号化および接続手順を合成したプロトコルである. TLS/SSL の証明書を付随させることにより、中間者攻撃等の被害を受けるリスクは軽減されている.
* RTMPT/RTMPTS: RTMP の通信を HTTP/HTTPS 上で行うプロトコルである. これらは RTMP に依存しない各種マネージドサービスとの連携による負荷分散が可能であり, 特に RTMPS は HTTPS によって通信経路が保護されているため, RTMP/RTMPE はもとより RTMPS と比べてもセキュリティの信頼性が高いプロトコルと言える. 

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

1. サーバ側は TCP の 1935 番ポートを開放し, クライアント側からの接続を待ち受ける.
2. クライアント側はサーバ側に TCP での接続を受理されたなら, TCP ハンドシェイクの後に RTMP 層でのハンドシェイクを行う.  
(TCP パケットの受信方法や TCP ハンドシェイクの実装がまだである場合は, それも行う必要がある.)
3. クライアント側はサーバ側に送信したハンドシェイクチャンクが妥当であると判断されたなら, RTMP 層でのアプリケーション接続を開始する.
4. アプリケーション接続に成功したなら, サーバ側はクライアント側とやり取りするチャンクメッセージに一意に ID を割り当てる.
5. 映像/音声チャンクの送受信を開始する.

### RTMP ハンドシェイク

RTMP 層におけるハンドシェイクは以下の手順で行う.

<div id="rtmp-handshake-sequences"></div>

1. クライアント側はサーバ側に C0 チャンクと C1 チャンクをそれぞれ送信する.
2. サーバ側はクライアント側から C0 チャンク と C1 チャンクをそれぞれ受信したなら, S0 チャンク, S1 チャンクおよび S2 チャンクをそれぞれクライアント側に送信する.
3. クライアント側はサーバ側から S0 チャンク, S1 チャンクおよび S2 チャンクをそれぞれ受信したなら, C2 チャンクをサーバ側へ送信する.
4. サーバ側はクライアント側から C2 チャンクを受け取ったなら, アプリケーション接続に移行する.

各種チャンクのフィールドの仕様は, [公式のドキュメント(PDF)](http://wwwimages.adobe.com/content/dam/Adobe/en/devnet/rtmp/pdf/rtmp_specification_1.0.pdf)によると以下の通りである.

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

以下に各 OSS の該当部分の実装を示す.

[FFmpeg/rtmpproto.c#L1200-L1236](https://github.com/FFmpeg/FFmpeg/blob/n4.1.4/libavformat/rtmpproto.c#L1200-L1236)

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

[obs-studio/rtmp.c#L4062](https://github.com/obsproject/obs-studio/blob/23.2.1/plugins/obs-outputs/librtmp/rtmp.c#L4062)

```c
clientbuf[0] = 0x03;		/* not encrypted */
```

[obs-studio/handshake.h#L831-L837](https://github.com/obsproject/obs-studio/blob/23.2.1/plugins/obs-outputs/librtmp/handshake.h#L831-L837)

```c
if (encrypted)
{
    clientsig[-1] = 0x06;	/* 0x08 is RTMPE as well */
    offalg = 1;
}
else
    clientsig[-1] = 0x03;
```

[red5-server-common/RTMPHandshake.java#L67](https://github.com/Red5/red5-server-common/blob/v1.1.1/src/main/java/org/red5/server/net/rtmp/RTMPHandshake.java#L67)

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

とされているが, 2019 年現在ここには利用している Flash Player/Adobe Media Server のバージョンが割り当てられている. 以下に各 OSS の該当部分の実装を示す.

C1 チャンクの場合:

[FFmpeg/rtmpproto.c#L1200-L1207](https://github.com/FFmpeg/FFmpeg/blob/n4.1.4/libavformat/rtmpproto.c#L1200-L1207)

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

[FFmpeg/rtmp.h#L32-L41](https://github.com/FFmpeg/FFmpeg/blob/n4.1.4/libavformat/rtmp.h#L32-L41)

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

[obs-studio/handshake.h#L842-L865](https://github.com/obsproject/obs-studio/blob/23.2.1/plugins/obs-outputs/librtmp/handshake.h#L842-L865)

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

[red5-server/InboundHandshake.java#L348-L352](https://github.com/Red5/red5-server/blob/v1.1.1/src/main/java/org/red5/server/net/rtmp/InboundHandshake.java#L348-L352)

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
とされているが, 2019 年現在これは単にランダムな値ではなく, Flash Player 9 および Adobe Media Server 3 以降は送信時に HMAC-SHA256 のハッシュを埋め込むようになっている. ハッシュに使うメッセージの位置は C0 チャンクおよび S0 チャンクで指定された RTMP のバージョンによって差異がある.  
それらの位置はそれぞれ以下の計算式で求めることができる.

ランダムなバイト列を$R$とおく.

RTMP(3) の場合:

$\displaystyle\sum_{i=0}^4 R_{i}\mod 728 + 12$

RTMPE(6, 8 および 9) の場合:

$\displaystyle\sum_{i=764}^4 R_{i}\mod 728 + 776$

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

仕様書の文言だけではわかりにくいが, 各種 OSS の実装の中にその答えがあったので以下に示す.

クライアント側の場合:

[FFmpeg/rtmpproto.c#L1248-L1258](https://github.com/FFmpeg/FFmpeg/blob/n4.1.4/libavformat/rtmpproto.c#L1248-L1258)

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

[obs-studio/rtmp.c#L4089-L4112](https://github.com/obsproject/obs-studio/blob/23.2.1/plugins/obs-outputs/librtmp/rtmp.c#L4089-L4112)

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

[obs-studio/handshake.h#L936](https://github.com/obsproject/obs-studio/blob/23.2.1/plugins/obs-outputs/librtmp/handshake.h#L936)

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

[FFmpeg/rtmpproto.c#L1452-L1472](https://github.com/FFmpeg/FFmpeg/blob/n4.1.4/libavformat/rtmpproto.c#L1452-L1472)

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

[obs-studio/rtmp.c#L4152-L4178](https://github.com/obsproject/obs-studio/blob/23.2.1/plugins/obs-outputs/librtmp/rtmp.c#L4152-L4178)

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

[obs-studio/hansdhake.h#L1442-L1447](https://github.com/obsproject/obs-studio/blob/23.2.1/plugins/obs-outputs/librtmp/handshake.h#L1442-L1447)
[obs-studio/handshake.h#L1524-L1528](https://github.com/obsproject/obs-studio/blob/23.2.1/plugins/obs-outputs/librtmp/handshake.h#L1524-L1528)

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

[red5-server/InboundHandshake.java#L213-L224](https://github.com/Red5/red5-server/blob/v1.1.1/src/main/java/org/red5/server/net/rtmp/InboundHandshake.java#L213-L224)
[red5-server/InboundHandshake.java#L304-L306](https://github.com/Red5/red5-server/blob/v1.1.1/src/main/java/org/red5/server/net/rtmp/InboundHandshake.java#L304-L306)

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

ただし, Flash Player 9 および Adobe Media Server 3 以上の場合は C1 チャンクおよび S1 チャンクのランダムバイト列の末尾 32 bytes を HMAC-SHA256 で求めたダイジェストに置き換えて送受信を行い, 受信時に[メッセージの位置を探し当てて](#fp9)ダイジェストと照合することでメッセージの正当性を検証する必要がある.

### Invoke(connect) から映像データの受信まで

RTMP層におけるハンドシェイクが完了したなら, サーバ側とクライアント側は映像の送受信に必要な情報を相互に伝達しあう. それは以下の手順で行う.

<div id="rtmp-application-connect-sequences"></div>

1. クライアント側はサーバ側に `Invoke(connect)` メッセージを送信する.
2. サーバ側はクライアント側から受信した `Invoke(connect)` メッセージをデコードし, 応答メッセージをクライアント側に送信する.
3. クライアント側はサーバ側から `Invoke(_result)` を受信したなら, `Invoke(createStream)` メッセージをサーバ側に送信し, メッセージストリームへの一意な ID の付番を要求する.
4. サーバ側はクライアント側から受信した `Invoke(createStream)` メッセージをデコードし, 応答メッセージをクライアント側に送信する.
5. クライアント側はサーバ側から `Invoke(_result)` を受信したなら, `Invoke(publish)` をサーバ側に送信し, 映像の送信開始を伝える.
6. サーバ側はクライアント側から受信した `Invoke(publish)` をデコードし, 応答メッセージをクライアント側に送信する.
7. 映像/音声の送受信を開始する.

#### Invoke(connect)

`Invoke(connect)` およびその応答メッセージの仕様は以下の通りである.

要求メッセージ:

|フィールド名|データ型|備考|
|-|-|-|
|コマンド名|String|`connect`|
|トランザクション ID|Number|`1`|
|コマンドオブジェクト|Object|名前と値のペア.<br>クライアント側のアプリケーションを接続するために必要な情報が書き込まれている.|
|追加のユーザ引数|Object|コマンドオブジェクトの他に必要な情報がある場合に設定する.|

応答メッセージ:

|フィールド名|データ型|備考|
|-|-|-|
|コマンド名|String|`_result`(アプリケーションを接続できる時)<br>もしくは<br>`_error`(アプリケーションを接続できない時)|
|トランザクション ID|Number|`1`|
|プロパティ|Object|名前と値のペア.<br>サーバ側のアプリケーションを接続するために必要な情報を書き込む.|
|インフォメーション|Object|名前と値のペア.<br>サーバ側の応答の状態を表すために必要な情報を書き込む.|

コマンドオブジェクト:

|プロパティ|データ型|備考|
|-|-|-|
|app|String|クライアントが接続しているサーバアプリケーションの名前.<br>多くの場合において, 起動時に渡される URL から参照する.<br>そのパターンは次の通りである: `protocol://server[:port][/app][/playpath]`|
|flashVer|String|Flash Playerのバージョン.<br>入力側か出力側かによって入力内容が違う.<br>出力側の場合: `FMLE/3.0 (compatible; <クライアント側のツールやライブラリの識別情報>)`<br>入力側の場合: `<OSの識別名> <Flash Playerのバージョン(カンマ区切り)>`|
|swfUrl|String|アプリケーション接続に必要な SWF ファイルの URL.<br>ツールによってデフォルトの入力内容に違いがある. 例えば:<br>FFmpeg の場合: 入力なし.<br>OBS の場合: `tcUrl` と同じ値.|
|tcUrl|String|接続先サーバの URL.<br>`protocol://server[:port][/app]` のフォーマットに従って入力する.<br>デフォルトは起動時にコマンドラインで渡された URL を参照する.|
|fpad|Boolean|プロキシが使われているなら `true` を入力する.|
|audioCodecs|Number|クライアントがサポートする音声コーデックの情報.|
|videoCodecs|Number|クライアントがサポートする映像コーデックの情報.|
|videoFunction|Number|クライアントがサポートする特別なビデオ機能の情報.|
|pageUrl|String|SWF ファイルがロードされた Web ページの URL.|
|objectEncoding|Number|AMF のエンコーディングメソッド.|

サポートしている音声コーデック:

|ビットフラグ|コーデック|備考|
|-|-|-|
|`0x0001`|Raw| |
|`0x0002`|ADPCM| |
|`0x0004`|MP3| |
|`0x0008`|Intel|使われていない.|
|`0x0010`|Unused|使われていない.|
|`0x0020`|Nerry8|NellyMoser at 8 kHz.|
|`0x0040`|Nerry|NellyMoser at 5, 11, 22 and 44 kHz.|
|`0x0080`|G711A|Adobe Media Server 限定のコーデックである.|
|`0x0100`|G711U|Adobe Media Server 限定のコーデックである.|
|`0x0200`|NELLY16|NellyMouser at 16 kHz.|
|`0x0400`|AAC| |
|`0x0800`|Speex| |
|`0xFFFF`|上記のすべて| |

サポートしている映像コーデック:

|ビットフラグ|コーデック|備考|
|-|-|-|
|`0x0001`|Unused|廃れている.|
|`0x0002`|JPEG|廃れている.|
|`0x0004`|Sorenson| |
|`0x0008`|Homebrew| |
|`0x0010`|On2VP6|Flash 8 以降にサポートしている.|
|`0x0020`|On2VP6 with alpha channel|同上.|
|`0x0040`|Homebrew v2| |
|`0x0080`|H264| |
|`0x00FF`|上記のすべて| |

サポートしているビデオ機能:

|ビットフラグ|機能|備考|
|-|-|-|
|`1`|Seek|クライアント側はフレーム精度の高いシークを実行できる.|

サポートしているエンコーディングメソッド:

|ビットフラグ|エンコーディング|備考|
|-|-|-|
|`0`|AMF0|Flash 6 以降にサポートしている.|
|`3`|AMF3|Flash 9 (ActionScript3) 以降にサポートしている.|

### パケットのメッセージフォーマット
## 映像/音声データに利用できるコーデック
### 音声コーデック
### 映像コーデック
## 参考文献

*[OSS]: Open Source Software
*[RTMP]: Real-Time Messaging Protocol
*[RTMPE]: Real-Time Messaging Protocol Encrypted
*[RTMPS]: Real-Time Messaging Protocol over TLS/SSL
*[RTMPT]: Real-Time Messaging Protocol over HTTP
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

