[[toc]]

## はじめに

[前頁]では RTMP の概要と当該プロトコルにおける通信手順について, 既存 OSS 製品の実装を参照しながら説明した. 本頁では前頁での説明を踏まえつつ, プログラミング言語を用いた実装を行っていく. ここで, 本実装に際して用いるツールを以下に記す.

* プログラミング言語: Rust 1.40.0
  * rand 0.7.3
  * rust-crypto 0.2.36
* クライアントツール: FFmpeg 4.2.2

## RTMP 接続とハンドシェイク

RTMP では, サーバ側はクライアント側からの接続を TCP の 1935 番ポートで待ち受ける.
これは Rust では以下のように書く.

```rust
use std::{
    io::{
        // prelude にある Result 型との衝突および混同を避けるため.
        Result as IOResult,
    },
    net::{
        TcpListener,
        TcpStream
    }
};

fn main() -> IOResult<()> {
    // リスナのインスタンス生成の成否を Result<TcpListener> 型で返す.
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    // TCP 接続を待ち受け, Incoming 型にラップする.
    // Incoming 型はイテレータを実装している.
    for incoming in listener.incoming() {
    // Incoming 型はイテレータから Result<TcpStream> 型を返す.
    let stream = incoming?;

    // Do something.
    }

    // 返り値の型を合わせるため.
    Ok(())
}
```

もしくは `accept()` メソッドを用いて以下のようにも書くことができる.

```rust
use std::{
    io::{
        Result as IOResult
    },
    net::{
        TcpListener,
        TcpStream
    }
};

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    // accept() はイテレータを実装した型を返さないので, loop で待ち受けを維持する必要がある.
    loop {
        // accept() は TCP 接続の成否を Result<(TcpStream, SocketAddr)> 型で返す.
        // 待ち受けに失敗すると Err を返すが, incoming() と同様に常時待ち受けるため, 基本的には気にしなくていいだろう.
        let (stream, addr) = listener.accept()?;

        // Do something.
    }
}
```

なお, 本頁では `incoming()` から接続を待ち受ける前提で例を示す.

### C0, C1 チャンク/S0, S1, S2 チャンク

クライアント側からの TCP 接続要求を受け入れたなら, 次にクライアント側との間でハンドシェイクを行う. RTMP におけるハンドシェイクは二段階ある. 以下に記すのは一段階目における実装である. ここで, 当該段階でのハンドシェイクデータの容量は受信時 1537 bytes (C0C1 チャンク), 送信時 3073 bytes (S0S1S2 チャンク) である.

```rust
use std::{
    io::{
        // ::std::error にある Error トレイトとの衝突および混同を避けるため,
        Error as IOError,
        ErrorKind,
        // クライアント側からのデータを読み取るために Read トレイトのメソッドが必要である.
        Read,
        Result as IO Result,
        // クライアント側へデータを送信するために Write トレイトのメソッドが必要である.
        Write
    },
    net::{
        TcpListener,
        TcpStream
    },
    time::{
        SystemTime
    }
};
use crypto::{
    hmac::{
        Hmac
    },
    sha2::{
        Sha256
    }
};
use rand::prelude::*;

const GENUINE_FP_KEY: &[u8] = &[
    // "Genuine Adobe Flash Player 001" (クライアント側がサーバ側に C1 チャンクを送信する時はこの部分のみを使う)
    0x47, 0x65, 0x6e, 0x75, 0x69, 0x6e, 0x65, 0x20, 0x41, 0x64, 0x6f, 0x62, 0x65, 0x20, 0x46, 0x6c, 0x61, 0x73, 0x68, 0x20, 0x4d, 0x65, 0x64, 0x69, 0x61, 0x20, 0x53, 0x65, 0x72, 0x76,
    // クライアント側がサーバ側から受信した S2 チャンクのダイジェストを確認する時にはこの部分も使う.
    0x65, 0x72, 0x20, 0x30, 0x30, 0x31, 0xf0, 0xee, 0xc2, 0x4a, 0x80, 0x68, 0xbe, 0xe8, 0x2e, 0x00, 0xd0, 0xd1, 0x02, 0x9e, 0x7e, 0x57, 0x6e, 0xec, 0x5d, 0x2d, 0x29, 0x80, 0x6f, 0xab, 0x93, 0xb8, 0xe6, 0x36, 0xcf, 0xeb, 0x31, 0xae
];
const GENUINE_FMS_KEY: &[u8] = &[
    // "Genuine Adobe Flash Media Server 001" (サーバ側がクライアント側に S1 チャンクを送信する時はこの部分のみを使う)
    0x47, 0x65, 0x6e, 0x75, 0x69, 0x6e, 0x65, 0x20, 0x41, 0x64, 0x6f, 0x62, 0x65, 0x20, 0x46, 0x6c, 0x61, 0x73, 0x68, 0x20, 0x4d, 0x65, 0x64, 0x69, 0x61, 0x20, 0x53, 0x65, 0x72, 0x76, 0x65, 0x72, 0x20, 0x30, 0x30, 0x31,
    // サーバ側がクライアント側から受信した C2 チャンクのダイジェストを確認する時にはこの部分も使う.
    0xf0, 0xee, 0xc2, 0x4a, 0x80, 0x68, 0xbe, 0xe8, 0x2e, 0x00, 0xd0, 0xd1, 0x02, 0x9e, 0x7e, 0x57, 0x6e, 0xec, 0x5d, 0x2d, 0x29, 0x80, 0x6f, 0xab, 0x93, 0xb8, 0xe6, 0x36, 0xcf, 0xeb, 0x31, 0xae
];

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        // 読み書きでストリームを消費するため.
        let mut stream = incoming?;

        /* C0 チャンクおよび C1 チャンクの受信を開始する. */

        // read() は可変なスライスを要求するが, 配列もまた参照にすることでスライスと同じ振る舞いをすることができる.
        let mut c0c1: [u8; 1537] = [0; 1537];

        // read() は成功時にその時点で読み取ったデータの容量を返し, すべてを読み切ると Ok(0) を返す.
        // ここでは所定の容量を一度で読み切っているため, バッファしたサイズを気にする必要はない.
        stream.read(&mut c0c1)?;

        // 仕様書には C0 チャンクの値はデフォルトで 3 (生の RTMP) であると指定されており, クライアント側もサーバ側もこのバージョンでなければ接続を閉じと良いとされている.
        // ただし, 必須の処理ではないため, この部分は実装しなくてもよい.
        if c0c1[0] != 3 {
            // ::std::io::Error::from() :: ErrorKind -> std::io::Error
            // into() は内部で from() を暗黙に呼ぶように実装されているため, From の実装がある型であれば変換元の型から into() を呼ぶことで変換することができる.
            return Err(ErrorKind::InvalidInput.into());
        }

        // usize 型の初期化値, つまり 0 が束縛される.
        let mut offset_client = usize::default();

        for i in 0..4 {
            // C0 チャンク (1 byte), タイムスタンプ (4 bytes) および Flash Player のバージョン (4 bytes) を飛ばす.
            offset_client += c0c1[9 + i] as usize;
        }

        offset_client = offset_client % 728 + 12;

        // サーバ側がクライアント側から受信した C1 チャンクに入力されている HMAC(SHA-256) ダイジェスト.
        let digest_client_sent = &c0c1[offset_client..(offset_client + 32)];
        let mut hmac_client = Hmac::new(Sha256::new(), &GENUINE_FP_KEY[..30]);

        // C1 チャンク中にある HMAC(SHA-256) のダイジェスト部分(と S0 チャンクを含めた最初の 9 bytes)を除く.
        hmac_client.input(&c0c1[9..(9 + offset_client)]);
        hmac_client.input(&c0c1[(9 + offset_client + 32)..]);

        // Hmac.result() :: &Hmac -> MacResult
        let digest_client_expected = hmac_client.result();

        // サーバ側がクライアント側から受信した C1 チャンクのダイジェストが実際に求めた結果と違う場合は, エラーとして接続を終了する.
        // MacResult.code() :: &MacResult -> &[u8]
        if digest_client_sent != digest_client_expected.code() {
            return Err(ErrorKind::InvalidData.into());
        }

        /* S0 チャンクおよび S1 チャンクの生成を開始する. */

        let mut s0s1s2: Vec<u8> = Vec::new();
        // SystemTime::now() :: SystemTime,
        // SystemTime.duration_since() :: SystemTime -> Result<Duration, SystemTimeError>,
        // Duration.as_secs() :: &Duration -> u64
        // 注:
        //
        // * ハンドシェイクチャンクのタイムスタンプは 4 bytes であるため, ビット幅を 8 bytes から小さくする必要がある.
        // * SystemTime.duration_since() から返される SystemTimeError は ::std::io::Error 型ではないため, ? 演算子ではコンテキストが一致しない.
        let timestamp_bytes = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs() as u32;

        // S0 チャンク(つまり, RTMP のバージョン)
        s0s1s2.push(3);
        s0s1s2.extend_from_slice(&timestamp_bytes.to_be_bytes());
        // Adobe Media Server の最新バージョン (5.0.10.0).
        // 前頁の通り, Flash Player 9/Adobe Media Server 3 の前後で違う処理を行う製品が存在する.
        // メジャーバージョン(先頭 1 byte)にさえ気をつけていればよいが, ハンドシェイクの段階で送受信した結果が噛み合わない場合はこの 4 bytes も注視すること.
        s0s1s2.extend_from_slice(&[5, 0, 10, 0]);

        for _ in 0..1528 {
            s0s1s2.push(random());
        }

        let mut offset_server = usize::default();

        for i in 0..4 {
            offset_server += s0s1s2[9 + i] as usize;
        }

        offset_server = offset_server % 728 + 12;

        let mut hmac_server = Hmac::new(Sha256::new(), &GENUINE_FMS_KEY[..36]);

        hmac_server.input(&s0s1s2[9..(9 + offset_server)]);
        hmac_server.input(&s0s1s2[(9 + offset_server + 32)..]);

        let digest_server = hmac.result().code();

        // HMAC(SHA-256) のダイジェストを所定の位置に上書きする.
        // これは以下のコードに置き換えることができる.
        //
        // for i in 0..digest_server.len() {
        //     s0s1s2[9 + offset_server + i] = digest_server[i];
        // }
        // 
        // 注: copy_from_slice() は双方のスライスの長さが一致していないと panic する.
        s0s1s2[(9 + offset_server)..(9 + offset_server + 32)].copy_from_slice(digest_server);

        /* S2 チャンクの生成を開始する. */

        hmac_client = Hmac::new(Sha256::new(), &GENUINE_FP_KEY);
        // サーバ側はクライアント側から受信した C1 チャンクに書き込まれたダイジェストを元に S2 チャンク用のダイジェストを生成する.
        hmac_client.input(digest_client_sent);

        let digest_s2 = hmac_client.result();

        // サーバ側は生成したダイジェストを鍵にして, S2 チャンクに書き込む署名を生成する.
        hmac_client = Hmac::new(Sha256::new(), digest_s2.code());
        // 署名を書き込む最後の 32 bytes を飛ばす.
        hmac_client.input(c0c1[9..(c0c1.len() - 32)]);

        let signature_s2 = hmac_client.result();

        // C1 チャンクの最後の 32 bytes を署名で上書きすることで S2 チャンクとする.
        c0c1[(c0c1.len() - 32)..].copy_from_slice(signature_s2.code());
        // S2 チャンクをサーバ側のハンドシェイクデータに付け加える.
        s0s1s2.extend_from_slice(&c0c1[1..]);
        // write() も成功時にその時点で書き込んだデータの容量を返し, すべてを書き切ると Ok(0) を返す.
        stream.write(s0s1s2.as_slice())?;
    }

    Ok(())
}
```

上記の通信の結果としてクライアント側との通信が閉じられなければ, サーバ側がクライアント側に送信したハンドシェイクデータは正しいということになる. ここで, コードの見やすさのために当該処理に名前を付ける.

```rust
use std::{
    io::{
        Error as IOError,
        ErrorKind,
        Read,
        Result as IOResult,
        Write
    },
    net::{
        TcpListener,
        TcpStream
    },
    time::{
        SystemTime
    }
};
use crypto::{
    hmac::{
        Hmac
    },
    sha2::{
        Sha256
    }
};
use rand::prelude::*;

const GENUINE_FP_KEY: &[u8] = &[
    0x47, 0x65, 0x6e, 0x75, 0x69, 0x6e, 0x65, 0x20, 0x41, 0x64, 0x6f, 0x62, 0x65, 0x20, 0x46, 0x6c, 0x61, 0x73, 0x68, 0x20, 0x4d, 0x65, 0x64, 0x69, 0x61, 0x20, 0x53, 0x65, 0x72, 0x76,
    0x65, 0x72, 0x20, 0x30, 0x30, 0x31, 0xf0, 0xee, 0xc2, 0x4a, 0x80, 0x68, 0xbe, 0xe8, 0x2e, 0x00, 0xd0, 0xd1, 0x02, 0x9e, 0x7e, 0x57, 0x6e, 0xec, 0x5d, 0x2d, 0x29, 0x80, 0x6f, 0xab, 0x93, 0xb8, 0xe6, 0x36, 0xcf, 0xeb, 0x31, 0xae
];
const GENUINE_FMS_KEY: &[u8] = &[
    0x47, 0x65, 0x6e, 0x75, 0x69, 0x6e, 0x65, 0x20, 0x41, 0x64, 0x6f, 0x62, 0x65, 0x20, 0x46, 0x6c, 0x61, 0x73, 0x68, 0x20, 0x4d, 0x65, 0x64, 0x69, 0x61, 0x20, 0x53, 0x65, 0x72, 0x76, 0x65, 0x72, 0x20, 0x30, 0x30, 0x31,
    0xf0, 0xee, 0xc2, 0x4a, 0x80, 0x68, 0xbe, 0xe8, 0x2e, 0x00, 0xd0, 0xd1, 0x02, 0x9e, 0x7e, 0x57, 0x6e, 0xec, 0x5d, 0x2d, 0x29, 0x80, 0x6f, 0xab, 0x93, 0xb8, 0xe6, 0x36, 0xcf, 0xeb, 0x31, 0xae
];

fn handle_first_handshake(stream: &mut TcpStream) -> IOResult<Vec<u8>> {
    let mut c0c1: [u8; 1537] = [0; 1537];

    stream.read(&mut c0c1)?;

    if c0c1[0] != 3 {
        return Err(ErrorKind::InvalidInput.into());
    }

    let mut offset_client = usize::default();

    for i in 0..4 {
        offset_client += c0c1[9 + i] as usize;
    }

    offset_client = offset_client % 728 + 12;

    let digest_client_sent = &c0c1[offset_client..(offset_client + 32)];
    let mut hmac_client = Hmac::new(Sha256::new(), &GENUINE_FP_KEY[..30]);

    hmac_client.input(&c0c1[9..(9 + offset_client)]);
    hmac_client.input(&c0c1[(9 + offset_client + 32)..]);

    let digest_client_expected = hmac_client.result();

    if digest_client_sent != digest_client_expected.code() {
        return Err(ErrorKind::InvalidData.into());
    }


    let mut s0s1s2: Vec<u8> = Vec::new();
    let timestamp = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs() as u32;

    s0s1s2.push(3);
    s0s1s2.extend_from_slice(&timestamp.to_be_bytes());
    s0s1s2.extend_from_slice(&[5, 0, 10, 0]);

    for _ in 0..1528 {
        s0s1s2.push(random());
    }

    let mut offset_server = usize::default();

    for i in 0..4 {
        offset_server += s0s1s2[9 + i] as usize;
    }

    offset_server = offset_server % 728 + 12;

    let mut hmac_server = Hmac::new(Sha256::new(), &GENUINE_FMS_KEY[..36]);

    hmac_server.input(&s0s1s2[9..(9 + offset_server)]);
    hmac_server.input(&s0s1s2[(9 + offset_server + 32)..]);

    let digest_server = hmac.result().code();

    s0s1s2[(9 + offset_server)..(9 + offset_server + 32)].copy_from_slice(digest_server);
    hmac_client = Hmac::new(Sha256::new(), &GENUINE_FP_KEY);
    hmac_client.input(digest_client_sent);

    let digest_s2 = hmac_client.result();

    hmac_client = Hmac::new(Sha256::new(), digest_s2.code());
    hmac_client.input(c0c1[9..(c0c1.len() - 32)]);

    let signature_s2 = hmac_client.result();

    // 二段階目のハンドシェイクは S1 チャンクと C2 チャンクの照合を必要とする.
    // 前のコードは for ループでやり切っていたが, 関数化したことによりこのままでは S0S1S2 チャンクのデータは破棄されてしまう.
    // そこで, S1 チャンクに相当する部分を S0S1S2 チャンクから切り出して呼び出し元に返すことにする.
    // スライス（実態は参照経由で扱う）のままではなく Vec に変換して返しているのも同様の理由である.
    stream.write(s0s1s2.as_slice()).map(|_| s0s1s2[1..(s0s1s2.len() - 1536)].to_vec())
}

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        let mut stream = incoming?;
        // ? 演算子で Result を unwrap した状態で束縛できる.
        let s1 = handle_first_handshake(stream)?;
    }

    Ok(())
}
```

### C2 チャンク

次に二段階目のハンドシェイクの例を記す. ここで, 当該段階でのハンドシェイクデータの容量は 1536 bytes (C2 チャンク) である. 当該処理の成功後すぐに後述の Invoke 処理の段階に移るため, ハンドシェイクデータの返送について考慮する必要はない.

```rust
use std::{
    io::{
        Error as IOError,
        ErrorKind,
        Read,
        Result as IO Result,
        Write
    },
    net::{
        TcpListener,
        TcpStream
    },
    time::{
        SystemTime
    }
};
use crypto::{
    hmac::{
        Hmac
    },
    sha2::{
        Sha256
    }
};
use rand::prelude::*;

const GENUINE_FP_KEY: &[u8] = &[
    0x47, 0x65, 0x6e, 0x75, 0x69, 0x6e, 0x65, 0x20, 0x41, 0x64, 0x6f, 0x62, 0x65, 0x20, 0x46, 0x6c, 0x61, 0x73, 0x68, 0x20, 0x4d, 0x65, 0x64, 0x69, 0x61, 0x20, 0x53, 0x65, 0x72, 0x76,
    0x65, 0x72, 0x20, 0x30, 0x30, 0x31, 0xf0, 0xee, 0xc2, 0x4a, 0x80, 0x68, 0xbe, 0xe8, 0x2e, 0x00, 0xd0, 0xd1, 0x02, 0x9e, 0x7e, 0x57, 0x6e, 0xec, 0x5d, 0x2d, 0x29, 0x80, 0x6f, 0xab, 0x93, 0xb8, 0xe6, 0x36, 0xcf, 0xeb, 0x31, 0xae
];
const GENUINE_FMS_KEY: &[u8] = &[
    0x47, 0x65, 0x6e, 0x75, 0x69, 0x6e, 0x65, 0x20, 0x41, 0x64, 0x6f, 0x62, 0x65, 0x20, 0x46, 0x6c, 0x61, 0x73, 0x68, 0x20, 0x4d, 0x65, 0x64, 0x69, 0x61, 0x20, 0x53, 0x65, 0x72, 0x76, 0x65, 0x72, 0x20, 0x30, 0x30, 0x31,
    0xf0, 0xee, 0xc2, 0x4a, 0x80, 0x68, 0xbe, 0xe8, 0x2e, 0x00, 0xd0, 0xd1, 0x02, 0x9e, 0x7e, 0x57, 0x6e, 0xec, 0x5d, 0x2d, 0x29, 0x80, 0x6f, 0xab, 0x93, 0xb8, 0xe6, 0x36, 0xcf, 0xeb, 0x31, 0xae
];

fn handle_first_handshake(stream: &mut TcpStream) -> IOResult<Vec<u8>> {
    let mut c0c1: [u8; 1537] = [0; 1537];

    stream.read(&mut c0c1)?;

    if c0c1[0] != 3 {
        return Err(ErrorKind::InvalidInput.into());
    }

    let mut offset_client = usize::default();

    for i in 0..4 {
        offset_client += c0c1[9 + i] as usize;
    }

    offset_client = offset_client % 728 + 12;

    let digest_client_sent = &c0c1[offset_client..(offset_client + 32)];
    let mut hmac_client = Hmac::new(Sha256::new(), &GENUINE_FP_KEY[..30]);

    hmac_client.input(&c0c1[9..(9 + offset_client)]);
    hmac_client.input(&c0c1[(9 + offset_client + 32)..]);

    let digest_client_expected = hmac_client.result();

    if digest_client_sent != digest_client_expected.code() {
        return Err(ErrorKind::InvalidData.into());
    }

    let mut s0s1s2: Vec<u8> = Vec::new();
    let timestamp = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs() as u32;

    s0s1s2.push(3);
    s0s1s2.extend_from_slice(&timestamp.to_be_bytes());
    s0s1s2.extend_from_slice(&[5, 0, 10, 0]);

    for _ in 0..1528 {
        s0s1s2.push(random());
    }

    let mut offset_server = usize::default();

    for i in 0..4 {
        offset_server += s0s1s2[9 + i] as usize;
    }

    offset_server = offset_server % 728 + 12;

    let mut hmac_server = Hmac::new(Sha256::new(), &GENUINE_FMS_KEY[..36]);

    hmac_server.input(&s0s1s2[9..(9 + offset_server)]);
    hmac_server.input(&s0s1s2[(9 + offset_server + 32)..]);

    let digest_server = hmac.result().code();

    s0s1s2[(9 + offset_server)..(9 + offset_server + 32)].copy_from_slice(digest_server);


    hmac_client = Hmac::new(Sha256::new(), &GENUINE_FP_KEY);
    hmac_client.input(digest_client_sent);

    let digest_s2 = hmac_client.result();

    hmac_client = Hmac::new(Sha256::new(), digest_s2.code());
    hmac_client.input(c0c1[9..(c0c1.len() - 32)]);

    let signature_s2 = hmac_client.result();

    c0c1[(c0c1.len() - 32)..].copy_from_slice(signature_s2.code());
    s0s1s2.extend_from_slice(&c0c1[1..]);
    stream.write(s0s1s2.as_slice()).map(|_| s0s1s2[1..(s0s1s2.len() - 1536)].to_vec())
}

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        let mut stream = incoming?;
        let s1 = handle_first_handshake(&mut stream)?;
        let mut c2: [u8; 1536] = [0; 1536];

        stream.read(&mut c2)?;

        let mut offset_server_s1 = usize::default();
        let mut offset_server_c2 = usize::default();

        for i in 0..4 {
            offset_server_s1 += s1[8 + i] as usize;
            offset_server_c2 += c2[8 + i] as usize;
        }

        offset_server_s1 = offset_server_s1 % 728 + 12;
        offset_server_c2 = offset_server_c2 % 728 + 12;

        let digest_s1 = &s1[offset_server_s1..(offset_server_s1 + 32)];
        let digest_c2 = &c2[offset_server_c2..(offset_server_c2 + 32)];

        if digest_s1 != digest_c2 {
            return Err(ErrorKind::InvalidData.into());
        }

        let mut hmac = Hmac::new(Sha256::new(), GENUINE_FMS_KEY);

        hmac.input(&s1[..offset_server_s1]);
        hmac.input(&s1[(offset_server_s1 + 32)..]);

        let digest = hmac.result();

        hmac = Hmac::new(Sha256::new(), digest.code());
        hmac.input(&s1[..(s1.len() - 32)]);

        let signature_s1 = hmac.result();
        let signature_c2 = &c2[(c2.len() - 32)..];

        // 注: FFmpeg は何故か C2 チャンクに署名を上書きしていないようであり, FFmpeg からの応答に対してこの処理を行うと必ずエラーになる.
        if signature_s1 != signature_c2 {
            return Err(ErrorKind::InvalidData.into());
        }

        /* Invoke チャンクの処理に移る. */
    }

    Ok(())
}
```

上記の処理の結果, S1 チャンクの署名と C2 チャンクの署名が一致していれば二段階目のハンドシェイクは完了である. ここで, 二段階目のハンドシェイク処理にも名前をつけ以下のように変更を加えることにする.

```rust
use std::{
    io::{
        Error as IOError,
        ErrorKind,
        Read,
        Result as IO Result,
        Write
    },
    net::{
        TcpListener,
        TcpStream
    },
    time::{
        SystemTime
    }
};
use crypto::{
    hmac::{
        Hmac
    },
    sha2::{
        Sha256
    }
};
use rand::prelude::*;

const GENUINE_FP_KEY: &[u8] = &[
    0x47, 0x65, 0x6e, 0x75, 0x69, 0x6e, 0x65, 0x20, 0x41, 0x64, 0x6f, 0x62, 0x65, 0x20, 0x46, 0x6c, 0x61, 0x73, 0x68, 0x20, 0x4d, 0x65, 0x64, 0x69, 0x61, 0x20, 0x53, 0x65, 0x72, 0x76,
    0x65, 0x72, 0x20, 0x30, 0x30, 0x31, 0xf0, 0xee, 0xc2, 0x4a, 0x80, 0x68, 0xbe, 0xe8, 0x2e, 0x00, 0xd0, 0xd1, 0x02, 0x9e, 0x7e, 0x57, 0x6e, 0xec, 0x5d, 0x2d, 0x29, 0x80, 0x6f, 0xab, 0x93, 0xb8, 0xe6, 0x36, 0xcf, 0xeb, 0x31, 0xae
];
const GENUINE_FMS_KEY: &[u8] = &[
    0x47, 0x65, 0x6e, 0x75, 0x69, 0x6e, 0x65, 0x20, 0x41, 0x64, 0x6f, 0x62, 0x65, 0x20, 0x46, 0x6c, 0x61, 0x73, 0x68, 0x20, 0x4d, 0x65, 0x64, 0x69, 0x61, 0x20, 0x53, 0x65, 0x72, 0x76, 0x65, 0x72, 0x20, 0x30, 0x30, 0x31,
    0xf0, 0xee, 0xc2, 0x4a, 0x80, 0x68, 0xbe, 0xe8, 0x2e, 0x00, 0xd0, 0xd1, 0x02, 0x9e, 0x7e, 0x57, 0x6e, 0xec, 0x5d, 0x2d, 0x29, 0x80, 0x6f, 0xab, 0x93, 0xb8, 0xe6, 0x36, 0xcf, 0xeb, 0x31, 0xae
];

fn handle_first_handshake(stream: &mut TcpStream) -> IOResult<Vec<u8>> {
    let mut c0c1: [u8; 1537] = [0; 1537];

    stream.read(&mut c0c1)?;

    if c0c1[0] != 3 {
        return Err(ErrorKind::InvalidInput.into());
    }

    let mut offset_client = usize::default();

    for i in 0..4 {
        offset_client += c0c1[9 + i] as usize;
    }

    offset_client = offset_client % 728 + 12;

    let digest_client_sent = &c0c1[offset_client..(offset_client + 32)];
    let mut hmac_client = Hmac::new(Sha256::new(), &GENUINE_FP_KEY[..30]);

    hmac_client.input(&c0c1[9..(9 + offset_client)]);
    hmac_client.input(&c0c1[(9 + offset_client + 32)..]);

    let digest_client_expected = hmac_client.result();

    if digest_client_sent != digest_client_expected.code() {
        return Err(ErrorKind::InvalidData.into());
    }

    let mut s0s1s2: Vec<u8> = Vec::new();
    let timestamp = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs() as u32;

    s0s1s2.push(3);
    s0s1s2.extend_from_slice(&timestamp.to_be_bytes());
    s0s1s2.extend_from_slice(&[5, 0, 10, 0]);

    for _ in 0..1528 {
        s0s1s2.push(random());
    }

    let mut offset_server = usize::default();

    for i in 0..4 {
        offset_server += s0s1s2[9 + i] as usize;
    }

    offset_server = offset_server % 728 + 12;

    let mut hmac_server = Hmac::new(Sha256::new(), &GENUINE_FMS_KEY[..36]);

    hmac_server.input(&s0s1s2[9..(9 + offset_server)]);
    hmac_server.input(&s0s1s2[(9 + offset_server + 32)..]);

    let digest_server = hmac.result().code();

    s0s1s2[(9 + offset_server)..(9 + offset_server + 32)].copy_from_slice(digest_server);


    hmac_client = Hmac::new(Sha256::new(), &GENUINE_FP_KEY);
    hmac_client.input(digest_client_sent);

    let digest_s2 = hmac_client.result();

    hmac_client = Hmac::new(Sha256::new(), digest_s2.code());
    hmac_client.input(c0c1[9..(c0c1.len() - 32)]);

    let signature_s2 = hmac_client.result();

    c0c1[(c0c1.len() - 32)..].copy_from_slice(signature_s2.code());
    s0s1s2.extend_from_slice(&c0c1[1..]);
    stream.write(s0s1s2.as_slice()).map(|_| s0s1s2[1..(s0s1s2.len() - 1536)].to_vec())
}

fn handle_second_handshake(stream: &mut TcpStream, s1: Vec<u8>) -> IOResult<()> {
    let mut c2: [u8; 1536] = [0; 1536];

    stream.read(&mut c2)?;

    let mut offset_server_s1 = usize::default();
    let mut offset_server_c2 = usize::default();

    for i in 0..4 {
        offset_server_s1 += s1[8 + i] as usize;
        offset_server_c2 += c2[8 + i] as usize;
    }

    offset_server_s1 = offset_server_s1 % 728 + 12;
    offset_server_c2 = offset_server_c2 % 728 + 12;

    let digest_s1 = &s1[offset_server_s1..(offset_server_s1 + 32)];
    let digest_c2 = &c2[offset_server_c2..(offset_server_c2 + 32)];

    if digest_s1 != digest_c2 {
        return Err(ErrorKind::InvalidData.into());
    }

    let mut hmac = Hmac::new(Sha256::new(), GENUINE_FMS_KEY);

    hmac.input(&s1[..offset_server_s1]);
    hmac.input(&s1[(offset_server_s1 + 32)..]);

    let digest = hmac.result();

    hmac = Hmac::new(Sha256::new(), digest.code());
    hmac.input(&s1[..(s1.len() - 32)]);

    let signature_s1 = hmac.result();
    let signature_c2 = &c2[(c2.len() - 32)..];

    // 注: FFmpeg は何故か C2 チャンクに署名を上書きしていないようであり, FFmpeg からの応答に対してこの処理を行うと必ずエラーになる.
    if signature_s1 != signature_c2 {
        return Err(ErrorKind::InvalidData.into());
    } else {
        return Ok(());
    }
}

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        let mut stream = incoming?;
        let s1 = handle_first_handshake(&mut stream)?;

        handle_second_handshake(&mut stream, s1)?;

        /* Invoke チャンクの処理に移る. */
    }

    Ok(())
}
```

## Invoke チャンクの処理

ハンドシェイクが完了したら, 実際の RTMP パケットをサーバ側とクライアント側で相互に送受信しあう. ここで, この段階で実際に送受信される Invoke チャンクの種類を以下に記す.

1. connect
2. releaseStream
3. onFCPublish
4. createStream
5. publish

### connect

二段階目のハンドシェイクが完了した後, サーバ側はクライアント側から以下の構造を持つチャンクを受信する.

チャンク基本ヘッダ:

* チャンクストリームID: 3
* チャンクメッセージヘッダのフォーマット: 0

チャンクメッセージヘッダ:

* タイムスタンプ: 0
* メッセージ長: 不定（クライアント側が指定した接続先 URL 等によって変動する）
* メッセージ種別ID: 20
* チャンクメッセージ ID: 0

拡張タイムスタンプ:

なし.

チャンクデータ:

* コマンド名: connect
* トランザクション ID: 1
* AMFオブジェクト (AMF 型番号: 3)
  * app: 不定
  * type: nonprivate
  * flashVer: FMLE/3.0 (compatible; Lavf 58.29.100)
  * tcUrl: 不定
  * オブジェクト型終了マーカ（空の AMF 文字列のフィールド名と型番号 9 の値のペア）

ここで, app および tcUrl の値が依存する部分を以下に記す.

* app: rtmp://example.com/appName/instance 中の *appName*
* tcUrl: rtmp://example.com/appName/instance (クライアント側が指定する接続先 URL そのもの)

#### チャンクの基本構造

上記の構造を Rust で表現する例を以下に記す.

```rust
use std::{
    collections::{
        HashMap
    }
};

struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

struct MessageHeader {
    timestamp: Option<u32>,
    // Rust の言語仕様を考慮すると usize が好ましいのだが, 3 bytes の上限を可能な限り超えさせないようにしつつ, 受信データの変換効率を考慮するため u32 型を選択する.
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

struct InvokeCommand {
    command_name: String,
    transaction_id: u64,
    command_object: HashMap<String, AmfData>
}

enum ChunkData {
    Invoke(InvokeCommand)
}

struct Chunk {
    basic_header: BasicHeader,
    message_header: MessageHeader,
    // 拡張タイムスタンプがない場合もあるため.
    extended_timestamp: Option<u32>,
    data: ChunkData
}
```

#### チャンクヘッダの読み取り

次に, ストリームからパケットを読み取りチャンクに変換していく処理を以下に記す.

```rust
use std::{
    io::{
        Error as IOError,
        ErrorKind,
        Read,
        Result as IOResult
    },
    net::{
        TcpListener,
        TcpStream
    };
};

struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

struct MessageHeader {
    timestamp: Option<u32>,
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        let mut stream = incoming?;

        /* ハンドシェイクは完了しているとみなす. */

        let mut first_byte: [u8; 1] = [0; 1];

        stream.read(&mut first_byte)?;

        // 先頭 2 bits がチャンクメッセージヘッダの形式を表す番号でる.
        let message_header_format = (first_byte[0] & 0xc0) >> 6;
        // 残りの 6 bits の値でチャンクストリーム ID の位置を特定する.
        let chunk_id = match first_byte[0] & 0x3f {
            // 0 ならば, 次の 1 byte がそれである.
            0 => {
                let mut chunk_id_bytes: [u8; 1] = [0; 1];

                stream.read(&mut chunk_id_bytes)?;
                // 直前の 6 bits の値が 0 の場合は実際の値より 64 少ないものとして受信するので, 正しい値に修正する.
                // この場合はビッグエンディアンであることに注意する.
                (u8::from_be_bytes(chunk_id_bytes) + 64) as u16
            },
            // 1 の場合は, 次の 2 bytes がそれである.
            1 => {
                let mut chunk_id_bytes: [u8; 2] = [0; 2];

                stream.read(&mut chunk_id_bytes)?;
                // 実際の値より 64 少ないものとして受信するのは前段と同様であるが, この場合はリトルエンディアンであることに注意する.
                u16::from_le_bytes(chunk_id_bytes) + 64
            },
            // 1 より大きいなら, それ自体がチャンクストリーム ID である. 
            n => n
        };
        let basic_header = BasicHeader {
            message_header_format,
            chunk_id
        };
        let timestamp;
        let message_length;
        let message_type;
        let message_header = if message_header_format == 0 {
            let mut timestamp_bytes: [u8; 3] = [0; 3];
            let mut message_length_bytes: [u8; 3] = [0; 3];
            let mut message_type_byte: [u8; 1] = [0; 1];
            let mut message_id_bytes: [u8; 4] = [0; 4];

            stream.read(&mut timestamp_bytes)?;
            stream.read(&mut message_length_bytes)?;
            stream.read(&mut message_type_byte)?;
            stream.read(&mut message_id_bytes)?;

            // from_*_bytes/to_*_bytes はそれぞれ配列とプリミティブ型を相互に変換するための transmute() のラッパであるが, プリミティブ型と同じサイズの配列を受け取るように実装されているため, ここでサイズを調整しておく.
            let mut timestamp_tmp: [u8; 4] = [0; 4];
            let mut message_length_tmp: [u8; 4] = [0; 4];

            timestamp_tmp[1..].copy_from_slice(&timestamp_bytes);
            message_length_tmp[1..].copy_from_slice(&message_length_bytes);

            timestamp = Some(u32::from_be_bytes(timestamp_tmp));
            message_length = Some(u32::from_be_bytes(message_length_tmp));
            message_type = Some(u8::from_be_bytes(message_type_byte));

            let message_id = Some(u32::from_le_bytes(message_id_bytes));

            MessageHeader {
                timestamp,
                message_length,
                message_type,
                message_id
            }
        } else if message_header_format == 1 {
            let mut timestamp_bytes: [u8; 3] = [0; 3];
            let mut message_length_bytes: [u8; 3] = [0; 3];
            let mut message_type_byte: [u8; 1] = [0; 1];

            stream.read(&mut timestamp_bytes)?;
            stream.read(&mut message_length_bytes)?;
            stream.read(&mut message_type_byte)?;

            // 前段と同様の理由である.
            let mut timestamp_tmp: [u8; 4] = [0; 4];
            let mut message_length_tmp: [u8; 4] = [0; 4];

            timestamp_tmp[1..].copy_from_slice(&timestamp_bytes);
            message_length_tmp[1..].copy_from_slice(&message_length_bytes);

            timestamp = Some(u32::from_be_bytes(timestamp_tmp));
            message_length = Some(u32::from_be_bytes(message_length_tmp));
            message_type = Some(u8::from_be_bytes(message_type_byte));

            MessageHeader {
                timestamp,
                message_length,
                message_type,
                message_id: None
            }
        } else if message_header_format == 2 {
            let mut timestamp_bytes: [u8; 3] = [0; 3];

            stream.read(&mut timestamp_bytes)?;

            // こちらも同様である.
            let mut timestamp_tmp: [u8; 4] = [0; 4];

            timestamp_tmp[1..].copy_from_slice(&timestamp_bytes);

            timestamp = Some(u32::from_be_bytes(timestamp_tmp));
            message_length = None;
            message_type = None;

            MessageHeader {
                timestamp,
                message_length,
                message_type,
                message_id: None
            }
        } else {
            timestamp = None;
            message_length = None;
            message_type = None;

            MessageHeader {
                timestamp,
                message_length,
                message_type,
                message_id: None
            }
        };
        let extended_timestamp = match timestamp {
            Some(n) if n == 0x00ffffff as u32 => {
                let mut extended_timestamp_bytes: [u8; 4] = [0; 4];

                stream.read(&mut extended_timestamp_bytes)?;
                Some(u32::from_be_bytes(extended_timestamp_bytes))
            },
            _ => None
        };

        /* チャンクデータの読み取り処理へ移る. */
    }

    Ok(())
}
```

上記の処理過程でエラーが一つも発生しなければ, チャンクデータまでのパケットの読み取りは成功である.

#### チャンクデータの読み取り

次に, チャンクデータを読み取る例を以下に記す. ここで, 送信されるチャンクデータのパターンを改めて以下に記す.

チャンクメッセージヘッダ中のメッセージ長の値が:

* 所定のチャンクサイズ以下の場合は, メッセージ長と丁度同じサイズのチャンクデータが送信される.
* そうでない場合は, チャンクデータが所定のチャンクサイズ単位で区切られ, それらの区切られたチャンクの間にはチャンク基本ヘッダと形式 3 のチャンクメッセージヘッダが挿入される. (つまりチャンク基本ヘッダのみのヘッダが挿入される)

```rust
use std::{
    io::{
        Error as IOError,
        ErrorKind,
        Read,
        Result as IOResult
    },
    net::{
        TcpListener,
        TcpStream
    }
};

// 公式仕様書が指定しているデフォルトのチャンクサイズである. 実際のチャンクサイズの指定の仕方については後述する.
const DEFAULT_CHUNK_SIZE: u32 = 128;

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        let mut stream = incoming?;

        /* 拡張タイムスタンプの読み取りまでは完了しているとみなす. */
        // message_length は前段のチャンクメッセージヘッダから読み取ったものを使う.
        if let Some(message_length) = message_length {
            let splits = if message_length <= DEFAULT_CHUNK_SIZE {
                // チャンクデータのメッセージ長が所定のチャンクサイズに収まっている場合は, 間のヘッダのことは考慮しなくてよい.
                0
            } else {
                // 以下のチャンクデータが流れてくることを想定する.
                //
                // chunk_data[0] + headers[1] + chunk_data[1] + ... + chunk_data[n]
                //
                // ここで,
                //
                // * chunk_data[0]: 128 bytes
                // * headers[1]: 1 byte
                // * chunk_data[1]: 128 bytes
                // * chunk_data[n]: less than 128 bytes
                //
                // である. 除算で単純に区切ろうとすると, 最後にある n 個目のチャンクデータを無視してしまう. したがって、剰余が存在するかどうかを加味しておく.
                // (bool は整数型にキャストが可能であり, false なら 0, true なら 1 となる)
                message_length / DEFAULT_CHUNK_SIZE + (message_length % DEFAULT_CHUNK_SIZE != 0) as u32;
            }
            let actual_message_length = (message_length + splits) as usize;
            let mut data_bytes: Vec<u8> = Vec::with_capacity(actual_message_length);

            // set_len() は Vec の長さを強制的に固定してしまうのでメモリ安全ではないが, Vec を固定長 slice として渡すための措置である.
            unsafe {
                data_bytes.set_len(actual_message_length);
            }

            // read_to_end() を呼べば Vec のまま渡せるが, あちらは終端に辿り着くまでストリームをブロックしてしまう.
            // そしてネットワークストリームには終端がないため, それはいつまでも解放されなくなってしまう.
            stream.read(data_bytes.as_mut_slice())?;

            /* 受信したチャンクデータの中から間に挟まっているヘッダを取り除く処理. */
            if splits > 0 {
                let mut split_data: Vec<u8> = Vec::new();

                for i in 0..splits {
                    let start = if i == 0 {
                        (DEFAULT_CHUNK_SIZE * i) as usize
                    } else {
                        // 間に挟まっているヘッダを無視するために 1 byte ずらす.
                        (DEFAULT_CHUNK_SIZE * i + 1) as usize
                    };
                    let end = start + DEFAULT_CHUNK_SIZE as usize;

                    split_data.extend_from_slice(&data_bytes[start..end]);
                }

                // 詰まりものが無事に取れたら, 再代入してスコープの外に出す.
                data_bytes = split_data;
            }

            /* 読み取ったチャンクデータをデコードする処理へ移る. */
        }
    }

    Ok(())
}
```

上記の過程でエラーが発生しなければ, チャンクデータのパケットの読み取りは成功である.

#### データ構造への変換

次に, 読み取ったチャンクデータを Invoke コマンドにデコードする例を以下に示す. Invoke コマンドの内容は AMF0 (Action Message Format version 0) によりエンコードされており, パケットをデコードする際には当該メッセージフォーマットをデコードすることも考慮する必要がある. ここで, Invoke チャンクのデータに使われている AMF0 のデータ型を以下に記す.

|フィールド          |マーカの数字|AMF0 のデータ型|
| :----------------- | ---------: | :------------ |
|コマンド名          |2           |`String`       |
|トランザクション ID |0           |`Number`       |
|コマンドオブジェクト|3           |`Object`       |

```rust
use std::{
    collections::{
        HashMap
    },
    io::{
        Error as IOError,
        ErrorKind,
        Read,
        Result as IOResult
    },
    net::{
        TcpListener,
        TcpStream
    }
};

enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Unknown
}

struct InvokeCommand {
    command_name: String,
    transaction_id: f64,
    command_object: HashMap<String, AmfData>
}

enum Data {
    Invoke(InvokeCommand)
}

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        let mut stream = incoming?;

        /* チャンクデータの読み取りまでは完了しているとみなす. */
        let mut offset = usize::default();
        // Command Name が AMF String 型だということは明確である.
        let command_name_type = data_bytes[offset];
        let mut command_name_length_bytes: [u8; 2] = [0; 2];

        offset += 1;
        command_name_length_bytes.copy_from_slice(&data_bytes[offset..(offset + 2)]);
        offset += 2;

        let command_name_length = u16::from_be_bytes(command_name_length_bytes) as usize;
        // data_bytes は前段で読み取ったチャンクデータである.
        let command_name = String::from_utf8(data_bytes[offset..(offset + command_name_length)].to_vec()).map_err(
            |_| IOError::from(ErrorKind::InvalidData)
        )?;

        offset += command_name_length;

        // トランザクション ID についても AMF Number 型であるということは明確である.
        let transaction_id_type = data_bytes[offset];

        offset += 1;

        let mut transaction_id_bytes: [u8; 8] = [0; 8];

        transaction_id_bytes.copy_from_slice(&data_bytes[offset..(offset + 8)]);
        offset += 8;

        let transaction_id = f64::from_bits(u64::from_be_bytes(transaction_id_bytes));
        // Command Object についても AMF Object 型であるということは明確である.
        let command_object_type = data_bytes[offset];
        let mut command_object: HashMap<String, AmfData> = HashMap::new();

        // AMF Object End 型（マーカ）は空の AMF String 型の後に続く.
        while &data_bytes[offset..(offset + 3)] != &[0, 0, 9] {
            // AMF Object 型のフィールド名はマーカのない AMF String 型である.
            let mut name_length_bytes: [u8; 2] = [0; 2];

            name_length_bytes.copy_from_slice(&data_bytes[offset..(offset + 2)]);
            offset += 2;

            let name_length = u16::from_be_bytes(name_length_bytes) as usize;
            let name = String::from_utf8(data_bytes[offset..(offset + name_length)].to_vec()).map_err(
                |_| IOError::from(ErrorKind::InvalidData)
            )?;

            offset += name_length;

            // AMF Object 型のフィールド値は何らかの AMF 型である. 従って, マーカに応じてデコードする内容を切り替える必要がある.
            // ここで, Command Object が持っているフィールドの型は以下の三種類である:
            //
            // * Number
            // * Boolean
            // * String
            let value = match data[offset] {
                // AMF Number 型である場合
                0 => {
                    // 読み終えたマーカの位置から先に進める.
                    offset += 1;

                    let mut number_bytes: [u8; 8] = [0; 8];

                    number_bytes.copy_from_slice(&data_bytes[offset..(offset + 8)]);
                    offset += 8;

                    let number = f64::from_bits(u64::from_be_bytes());

                    AmfData::Number(number)
                },
                // AMF Boolean 型である場合
                1 => {
                    // 読み終えたマーカの位置から先に進める.
                    offset += 1;

                    let boolean = data_bytes[offset] > 0;

                    offset += 1;
                    AmfData::Boolean(boolean)
                },
                // AMF String 型である場合
                2 => {
                    // 読み終えたマーカの位置から先に進める.
                    offset += 1;

                    let mut string_length_bytes: [u8; 2] = [0; 2];

                    string_length_bytes.copy_from_slice(&data_bytes[offset..(offset + 2)]);
                    offset += 2;

                    let string_length = u16::from_be_bytes(string_length_bytes) as usize;
                    let string = String::from_utf8(data_bytes[offset..(offset + string_length)]).map_err(
                        |_| IOError::from(ErrorKind::InvalidData)
                    )?;

                    offset += string_length;
                    AmfData::String(string)
                },
                _ => {
                    /* 残りの AMF データ型の実装は後述する. */
                    AmfData::Unknown
                }
            };

            command_object.insert(name, value);
        }

        let data = Data::Invoke(
            InvokeCommand {
                command_name,
                transaction_id,
                command_object
            }
        );

        /* Invoke の返送チャンクを送信する処理に移る. */
    }

    Ok(())
}
```

上記の実装より, AMF 型のデコード処理は重複しうることがわかる. 従って, 当該部分を関数化して処理の分岐を容易にする.

```rust
use std::{
    collections::{
        HashMap
    },
    io::{
        Error as IOError,
        ErrorKind,
        Read,
        Result as IOResult
    },
    net::{
        TcpListener,
        TcpStream
    }
};

enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Unknown
}

struct InvokeCommand {
    command_name: String,
    transaction_id: f64,
    command_object: HashMap<String, AmfData>
}

enum Data {
    Invoke(InvokeCommand)
}

fn decode_amf_number(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let mut number_bytes: [u8; 8] = [0; 8];

    number_bytes.copy_from_slice(&data[*offset..(*offset + 8)]);
    *offset += 8;

    let number = f64::from_bits(u64::from_be_bytes(number_bytes));

    Ok(AmfData::Number(number))
}

fn decode_amf_boolean(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let boolean = data[*offset] > 0;

    *offset += 1;
    Ok(AmfData::Boolean(boolean))
}

fn decode_amf_string(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let mut length_bytes: [u8; 2] = [0; 2];

    length_bytes.copy_from_slice(&data[*offset..(*offset + 2)]);
    *offset += 2;

    let string = String::from_utf8(data[*offset..(*offset + length)].to_vec()).map_err(
        |_| IOError::from(ErrorKind::InvalidData)
    )?;

    *offset += length;
    Ok(AmfData::String(string))
}

fn decode_amf_object(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let mut object: HashMap<String, AmfData> = HashMap::new();

    while &data[*offset..(*offset + 3)] != &[0, 0, 9] {
        let name = decode_amf_string(data, offset)?.string().unwrap();
        let value = decode_amf_data(data, offset)?;

        object.insert(name, value);
    }

    Ok(AmfData::Object(object))
}

fn decode_amf_unknown(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    /* 当該部分の実装は後述する. */
    Ok(AmfData::Unknown)
}

fn decode_amf_data(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    match data[*offset] {
        0 => {
            *offset += 1;
            decode_amf_number(data, offset)
        },
        1 => {
            *offset += 1;
            decode_amf_boolean(data, offset)
        },
        2 => {
            *offset += 1;
            decode_amf_string(data, offset)
        },
        3 => {
            *offset += 1;
            decode_amf_object(data, offset)
        },
        _ => {
            *offset += 1;
            decode_amf_unknown()
        }
    }
}

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        let mut stream = incoming?;

        /* チャンクデータの読み取りまでは完了しているとみなす. */
        let mut offset = usize::default();
        let command_name = decode_amf_data(&data_bytes, &mut offset)?;
        let transaction_id = decode_amf_data(&data_bytes, &mut offset)?;
        let command_object = decode_amf_data(&data_bytes, &mut offset)?;
        let data = Data::Invoke(
            InvokeCommand {
                command_name,
                transaction_id,
                command_object
            }
        );

        /* Invoke の返送チャンクを送信する処理に移る. */
    }

    Ok(())
}
```

Invoke チャンクのデコードが完了したなら, それを前段で読み取った各ヘッダと共に一つのチャンクにする.

```rust
use std::{
    collections::{
        HashMap
    },
    io::{
        Error as IOError,
        ErrorKind,
        Read,
        Result as IOResult
    },
    net::{
        TcpListener,
        TcpStream
    }
};

const DEFAULT_CHUNK_SIZE: u32 = 128;

struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

struct MessageHeader {
    timestamp: Option<u32>,
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Unknown
}

struct InvokeCommand {
    command_name: String,
    transaction_id: f64,
    command_object: HashMap<String, AmfData>
}

enum Data {
    Invoke(InvokeCommand)
}

struct Chunk {
    basic_header: BasicHeader,
    message_header: MessageHeader,
    extended_timestamp: Option<u32>,
    data: Data
}

fn decode_amf_number(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let mut number_bytes: [u8; 8] = [0; 8];

    number_bytes.copy_from_slice(&data[*offset..(*offset + 8)]);
    *offset += 8;

    let number = f64::from_bits(u64::from_be_bytes(number_bytes));

    Ok(AmfData::Number(number))
}

fn decode_amf_boolean(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let boolean = data[*offset] > 0;

    *offset += 1;
    Ok(AmfData::Boolean(boolean))
}

fn decode_amf_string(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let mut length_bytes: [u8; 2] = [0; 2];

    length_bytes.copy_from_slice(&data[*offset..(*offset + 2)]);
    *offset += 2;

    let string = String::from_utf8(data[*offset..(*offset + length)].to_vec()).map_err(
        |_| IOError::from(ErrorKind::InvalidData)
    )?;

    *offset += length;
    Ok(AmfData::String(string))
}

fn decode_amf_object(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let mut object: HashMap<String, AmfData> = HashMap::new();

    while &data[*offset..(*offset + 3)] != &[0, 0, 9] {
        let name = decode_amf_string(data, offset)?.string().unwrap();
        let value = decode_amf_data(data, offset)?;

        object.insert(name, value);
    }

    Ok(AmfData::Object(object))
}

fn decode_amf_unknown(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    /* 当該部分の実装は後述する. */
    Ok(AmfData::Unknown)
}

fn decode_amf_data(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    match data[*offset] {
        0 => {
            *offset += 1;
            decode_amf_number(data, offset)
        },
        1 => {
            *offset += 1;
            decode_amf_boolean(data, offset)
        },
        2 => {
            *offset += 1;
            decode_amf_string(data, offset)
        },
        3 => {
            offset += 1;
            decode_amf_object(data, offset)
        },
        _ => {
            *offset += 1;
            decode_amf_unknown()
        }
    }
}

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        let mut stream = incoming?;

        /* ハンドシェイクは完了しているとみなす. */
        /* チャンク基本ヘッダの読み取り処理 */
        let mut first_byte: [u8; 1] = [0; 1];

        stream.read(&mut first_byte)?;

        let message_header_format = (first_byte[0] & 0xc0) >> 6;
        let chunk_id = match first_byte[0] & 0x3f {
            0 => {
                let mut chunk_id_bytes: [u8; 1] = [0; 1];

                stream.read(&mut chunk_id_bytes)?;
                (u8::from_be_bytes(chunk_id_bytes) + 64) as u16
            },
            1 => {
                let mut chunk_id_bytes: [u8; 2] = [0; 2];

                stream.read(&mut chunk_id_bytes)?;
                u16::from_le_bytes(chunk_id_bytes) + 64
            },
            n => n
        };
        let basic_header = BasicHeader {
            message_header_format,
            chunk_id
        };
        /* チャンクメッセージヘッダの読み取り処理. */
        let timestamp;
        let message_length;
        let message_type;
        let message_header = if message_header_format == 0 {
            let mut timestamp_bytes: [u8; 3] = [0; 3];
            let mut message_length_bytes: [u8; 3] = [0; 3];
            let mut message_type_byte: [u8; 1] = [0; 1];
            let mut message_id_bytes: [u8; 4] = [0; 4];

            stream.read(&mut timestamp_bytes)?;
            stream.read(&mut message_length_bytes)?;
            stream.read(&mut message_type_byte)?;
            stream.read(&mut message_id_bytes)?;

            let mut timestamp_tmp: [u8; 4] = [0; 4];
            let mut message_length_tmp: [u8; 4] = [0; 4];

            timestamp_tmp[1..].copy_from_slice(&timestamp_bytes);
            message_length_tmp[1..].copy_from_slice(&message_length_bytes);

            timestamp = Some(u32::from_be_bytes(timestamp_tmp));
            message_length = Some(u32::from_be_bytes(message_length_tmp));
            message_type = Some(u8::from_be_bytes(message_type_byte));

            let message_id = Some(u32::from_le_bytes(message_id_bytes));

            MessageHeader {
                timestamp,
                message_length,
                message_type,
                message_id
            }
        } else if message_header_format == 1 {
            let mut timestamp_bytes: [u8; 3] = [0; 3];
            let mut message_length_bytes: [u8; 3] = [0; 3];
            let mut message_type_byte: [u8; 1] = [0; 1];

            stream.read(&mut timestamp_bytes)?;
            stream.read(&mut message_length_bytes)?;
            stream.read(&mut message_type_byte)?;

            let mut timestamp_tmp: [u8; 4] = [0; 4];
            let mut message_length_tmp: [u8; 4] = [0; 4];

            timestamp_tmp[1..].copy_from_slice(&timestamp_bytes);
            message_length_tmp[1..].copy_from_slice(&message_length_bytes);

            timestamp = Some(u32::from_be_bytes(timestamp_tmp));
            message_length = Some(u32::from_be_bytes(message_length_tmp));
            message_type = Some(u8::from_be_bytes(message_type_byte));

            MessageHeader {
                timestamp,
                message_length,
                message_type,
                message_id: None
            }
        } else if message_header_format == 2 {
            let mut timestamp_bytes: [u8; 3] = [0; 3];

            stream.read(&mut timestamp_bytes)?;

            let mut timestamp_tmp: [u8; 4] = [0; 4];

            timestamp_tmp[1..].copy_from_slice(&timestamp_bytes);

            timestamp = Some(u32::from_be_bytes(timestamp_tmp));
            message_length = None;
            message_type = None;

            MessageHeader {
                timestamp,
                message_length,
                message_type,
                message_id: None
            }
        } else {
            timestamp = None;
            message_length = None;
            message_type = None;

            MessageHeader {
                timestamp,
                message_length,
                message_type,
                message_id: None
            }
        };
        /* 拡張タイムスタンプの読み取り処理. (もしあれば) */
        let extended_timestamp = match timestamp {
            Some(n) if n == 0x00ffffff as u32 => {
                let mut extended_timestamp_bytes: [u8; 4] = [0; 4];

                stream.read(&mut extended_timestamp_bytes)?;
                Some(u32::from_be_bytes(extended_timestamp_bytes))
            },
            _ => None
        };

        /* チャンクデータの読み取り処理. */
        if let Some(message_length) = message_length {
            let splits = if message_length <= DEFAULT_CHUNK_SIZE {
                0
            } else {
                message_length / DEFAULT_CHUNK_SIZE + (message_length % DEFAULT_CHUNK_SIZE != 0) as u32;
            }

            let actual_message_length = (message_length + splits) as usize;
            let mut data_bytes: Vec<u8> = Vec::with_capacity(actual_message_length);

            unsafe {
                data_bytes.set_len(actual_message_length);
            }

            stream.read(data_bytes.as_mut_slice())?;

            if splits > 0 {
                let mut split_data: Vec<u8> = Vec::new();

                for i in 0..splits {
                    let start = if i == 0 {
                        (DEFAULT_CHUNK_SIZE * i) as usize
                    } else {
                        (DEFAULT_CHUNK_SIZE * i + 1) as usize
                    };
                    let end = start + DEFAULT_CHUNK_SIZE as usize;

                    split_data.extend_from_slice(&data_bytes[start..end]);
                }

                data_bytes = split_data;
            }
        }

        let mut offset = usize::default();
        let command_name = decode_amf_data(&data_bytes, &mut offset)?;
        let transaction_id = decode_amf_data(&data_bytes, &mut offset)?;
        let command_object = decode_amf_data(&data_bytes, &mut offset)?;
        let data = Data::Invoke(
            InvokeCommand {
                command_name,
                transaction_id,
                command_object
            }
        );
        let chunk = Chunk {
            basic_header,
            message_header,
            extended_timestamp,
            data
        };

        /* Invoke の返送チャンクを送信する処理に移る. */
    }

    Ok(())
}
```

ここで, 後述のチャンク返送処理や他のチャンクの受信処理のために上記の実装をさらに関数化して全体を見やすくしておく.

```rust
use std::{
    collections::{
        HashMap
    },
    io::{
        Error as IOError,
        ErrorKind,
        Read,
        Result as IOResult
    },
    net::{
        TcpListener,
        TcpStream
    }
};

const DEFAULT_CHUNK_SIZE: u32 = 128;

struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

impl BasicHeader {
    fn get_message_header_format(&self) -> u8 {
        self.message_header_format
    }
}

struct MessageHeader {
    timestamp: Option<u32>,
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

impl MessageHeader {
    fn get_timestamp(&self) -> Option<u32> {
        self.timestamp
    }

    fn get_message_length(&self) -> Option<u32> {
        self.message_length
    }

    fn get_message_type(&self) -> Option<u8> {
        self.message_type
    }
}

enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Unknown
}

struct InvokeCommand {
    command_name: String,
    transaction_id: f64,
    command_object: HashMap<String, AmfData>
}

enum Data {
    Invoke(InvokeCommand),
    Unknown(Vec<u8>)
}

struct Chunk {
    basic_header: BasicHeader,
    message_header: MessageHeader,
    extended_timestamp: Option<u32>,
    data: Data
}

fn decode_amf_number(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let mut number_bytes: [u8; 8] = [0; 8];

    number_bytes.copy_from_slice(&data[*offset..(*offset + 8)]);
    *offset += 8;

    let number = f64::from_bits(u64::from_be_bytes(number_bytes));

    Ok(AmfData::Number(number))
}

fn decode_amf_boolean(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let boolean = data[*offset] > 0;

    *offset += 1;
    Ok(AmfData::Boolean(boolean))
}

fn decode_amf_string(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let mut length_bytes: [u8; 2] = [0; 2];

    length_bytes.copy_from_slice(&data[*offset..(*offset + 2)]);
    *offset += 2;

    let string = String::from_utf8(data[*offset..(*offset + length)].to_vec()).map_err(
        |_| IOError::from(ErrorKind::InvalidData)
    )?;

    *offset += length;
    Ok(AmfData::String(string))
}

fn decode_amf_object(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let mut object: HashMap<String, AmfData> = HashMap::new();

    while &data[*offset..(*offset + 3)] != &[0, 0, 9] {
        let name = decode_amf_string(data, offset)?.string().unwrap();
        let value = decode_amf_data(data, offset)?;

        object.insert(name, value);
    }

    Ok(AmfData::Object(object))
}

fn decode_amf_unknown(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    /* 当該部分の実装は後述する. */
    Ok(AmfData::Unknown)
}

fn decode_amf_data(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    match data[*offset] {
        0 => {
            *offset += 1;
            decode_amf_number(data, offset)
        },
        1 => {
            *offset += 1;
            decode_amf_boolean(data, offset)
        },
        2 => {
            *offset += 1;
            decode_amf_string(data, offset)
        },
        3 => {
            offset += 1;
            decode_amf_object(data, offset)
        },
        _ => {
            *offset += 1;
            decode_amf_unknown()
        }
    }
}

fn receive_basic_header(stream: &mut TcpStream) -> IOResult<BasicHeader> {
    let mut first_byte: [u8; 1] = [0; 1];

    stream.read(&mut first_byte)?;

    let message_header_format = (first_byte[0] & 0xc0) >> 6;
    let chunk_id = match first_byte[0] & 0x3f {
        0 => {
            let mut chunk_id_bytes: [u8; 1] = [0; 1];

            stream.read(&mut chunk_id_bytes)?;
            (u8::from_be_bytes(chunk_id_bytes) + 64) as u16
        },
        1 => {
            let mut chunk_id_bytes: [u8; 2] = [0; 2];

            stream.read(&mut chunk_id_bytes)?;
            u16::from_le_bytes(chunk_id_bytes) + 64
        },
        n => n
    };

    Ok(
        BasicHeader {
            message_header_format,
            chunk_id
        }
    )
}

fn receive_message_header(stream: &mut TcpStream, message_header_format: u8) -> IOResult<MessageHeader> {
    if message_header_format == 0 {
        let mut timestamp_bytes: [u8; 3] = [0; 3];
        let mut message_length_bytes: [u8; 3] = [0; 3];
        let mut message_type_bytes: [u8; 1] = [0; 1];
        let mut message_id_bytes: [u8; 4] = [0; 4];

        stream.read(&mut timestamp_bytes)?;
        stream.read(&mut message_length_bytes)?;
        stream.read(&mut message_type_bytes)?;
        stream.read(&mut message_id_bytes)?;

        let mut timestamp_tmp: [u8; 4] = [0; 4];
        let mut message_length_tmp: [u8; 4] = [0; 4];

        timestamp_tmp[1..].copy_from_slice(&timestamp_bytes);
        message_length_tmp[1..].copy_from_slice(&message_length_bytes);

        let timestamp = Some(u32::from_be_bytes(timestamp_tmp));
        let message_length = Some(u32::from_be_bytes(message_length_tmp));
        let message_type = Some(message_type_bytes[0]);
        let message_id = Some(u32::from_le_bytes(message_id_bytes));

        Ok(
            MessageHeader {
                timestamp,
                message_length,
                message_type,
                message_id
            }
        )
    } else if message_header_format == 1 {
        let mut timestamp_bytes: [u8; 3] = [0; 3];
        let mut message_length_bytes: [u8; 3] = [0; 3];
        let mut message_type_bytes: [u8; 1] = [0; 1];

        stream.read(&mut timestamp_bytes)?;
        stream.read(&mut message_length_bytes)?;
        stream.read(&mut message_type_bytes)?;

        let mut timestamp_tmp: [u8; 4] = [0; 4];
        let mut message_length_tmp: [u8; 4] = [0; 4];

        timestamp_tmp[1..].copy_from_slice(&timestamp_bytes);
        message_length_tmp[1..].copy_from_slice(&message_length_bytes);

        let timestamp = Some(u32::from_be_bytes(timestamp_tmp));
        let message_length = Some(u32::from_be_bytes(message_length_tmp));
        let message_type = Some(message_type_bytes[0]);

        Ok(
            MessageHeader {
                timestamp,
                message_length,
                message_type,
                message_id: None
            }
        )
    } else if message_header_format == 2 {
        let mut timestamp_bytes: [u8; 3] = [0; 3];

        stream.read(&mut timestamp_bytes)?;

        let mut timestamp_tmp: [u8; 4] = [0; 4];

        timestamp_tmp[1..].copy_from_slice(&timestamp_bytes);

        let timestamp = Some(u32::from_be_bytes(timestamp_tmp));

        Ok(
            MessageHeader {
                timestamp,
                message_length: None,
                message_type: None,
                message_id: None
            }
        )
    } else {
        Ok(
            MessageHeader {
                timestamp: None,
                message_length: None,
                message_type: None,
                message_id: None
            }
        )
    }
}

fn receive_extended_timestamp(stream: &mut TcpStream, timestamp: u32) -> IOResult<Option<u32>> {
    if n == 0x00ffffff {
        let mut extended_timestamp_bytes: [u8; 4] = [0; 4];

        stream.read(&mut extended_timestamp_bytes)?;
        Ok(Some(u32::from_be_bytes(extended_timestamp_bytes)))
    } else {
        Ok(None)
    }
}

fn decode_invoke(data: &Vec<u8>) -> IOResult<Data> {
    let mut offset = usize::default();
    let command_name = decode_amf_data(data, &mut offset)?;
    let transaction_id = decode_amf_data(data, &mut offset)?;
    let command_object = decode_amf_data(data, &mut offset)?;

    Ok(
        Data::Invoke(
            InvokeCommand {
                command_name,
                transaction_id,
                command_object
            }
        )
    )
}

fn receive_data(stream: &mut TcpStream, message_type: u8, message_length: u32) -> IOResult<Data> {
    let splits = if message_length <= DEFAULT_CHUNK_SIZE {
        0
    } else {
        message_length / DEFAULT_CHUNK_SIZE + (message_length % DEFAULT_CHUNK_SIZE > 0) as u32
    };
    let actual_message_length = (message_length + splits) as usize;
    let mut data_bytes: Vec<u8> = Vec::with_capacity(actual_message_length);

    unsafe {
        data_bytes.set_len(actual_message_length);
    }

    stream.read(data_bytes.as_mut_slice())?;

    if splits > 0 {
        let mut split_data: Vec<u8> = Vec::new();

        for i in 0..splits {
            let start = if i == 0 {
                (DEFAULT_CHUNK_SIZE * i) as usize
            } else {
                (DEFAULT_CHUNK_SIZE * i + 1) as usize;
            };
            let end = start + DEFAULT_CHUNK_SIZE as usize;

            split_data.extend_from_slice(&data_bytes[start..end]);
        }

        data_bytes = split_data;
    }

    match message_type {
        20 => decode_invoke(data_bytes),
        _ => Ok(Data::Unknown(data_bytes))
    }
}

fn receive_chunk(stream: &mut TcpStream) -> IOResult<Chunk> {
    let basic_header = receive_basic_header(stream)?;
    let message_header = receive_message_header(stream, basic_header.get_message_header_format())?;
    // 今のところ, 必ず Some が返されると仮定する.
    let extended_timestamp = receive_extended_timestamp(stream, message_header.get_timestamp().unwrap())?;
    let data = receive_data(stream, message_header.get_message_type().unwrap(), message_header.get_message_length().unwrap())?;

    Ok(
        Chunk {
            basic_header,
            message_header,
            extended_timestamp,
            data
        }
    )
}

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        let mut stream = incoming?;

        /* ハンドシェイクは完了しているとみなす. */
        let received_chunk = receive_chunk(&mut stream)?;

        /* Invoke の返送チャンクを送信する処理に移る. */
    }

    Ok(())
}
```

サーバ側はクライアント側からのチャンクの受信が完了したなら, クライアント側に受信結果を伝えるための返送チャンクを送信する.

#### connect コマンド要求への返送手順

ここで, 当該返送処理に必要な通信の手順を以下に改めて記す.

<div id="rtmp-invoke-connect-sequences">

!!!include(invoke-connect-sequences-fixed.md)!!!

</div>

図1. Invoke(connect) チャンクの送受信手順 {#caption-rtmp-invoke-connect-sequences}

次に, 各返送チャンクに必要な値を以下に記す.

|メッセージの種類                              |チャンクストリーム ID|タイムスタンプ|メッセージ長|メッセージ種類 ID|メッセージストリーム ID|チャンクデータ  |
| :------------------------------------------- | ------------------: | -----------: | ---------: | --------------: | --------------------: | :------------- |
|Window Acknowledgement Size / Server Bandwidth|2                    |0             |4           |5                |0                      |サーバ側の帯域幅                                          |
|Set Peer Bandwidth / Client Bandwidth         |2                    |0             |5           |6                |0                      |クライアント側の帯域幅 + 帯域幅の調整方法 (Dynamic)       |
|User Control / Ping                           |2                    |0             |6           |4                |0                      |イベント ID (0) + メッセージストリーム ID (この時はまだ 0)|
|Chunk Size                                    |2                    |0             |4           |1                |0                      |通信一度あたりのチャンクのデータ量                        |
|Invoke(\_result)                              |3                    |0             |?           |20               |0                      |Invoke リクエストの返送メッセージ                        |

##### メッセージ長の求め方

Invoke(\_result) チャンクのメッセージ長はサーバ側がどのような値を入力していくかによって変動するため, 不定である. その実際の長さは, バイト列に変換した後のチャンクデータの大きさとして求める.

```rust
use std::{
    collections::{
        HashMap
    },
    io::{
        Result as IOResult
    },
    net::{
        TcpListener,
        TcpStream
    }
};

enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Unknown
}

enum InvokeCommand {
    Request {
        command_name: String,
        transaction_id: f64,
        command_object: HashMap<String, AmfData>
    },
    Response {
        command_name: String,
        transaction_id: f64,
        properties: HashMap<String, AmfData>,
        information: HashMap<String, AmfData>
    }
}

enum Data {
    ChunkSize(u32),
    Ping(u16, PingData),
    ServerBandwidth(u32),
    ClientBandwidth(u32, u8),
    Invoke(InvokeCommand),
    Unknown(Vec<u8>)
}

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        let mut stream = incoming?;
        /* Invoke(connect) チャンクの受信までは完了しているとみなす. */
        let mut properties: HashMap<String, AmfData> = HashMap::new();
        let mut information: HashMap<String, AmfData> = HashMap::new();

        properties.insert("fmsVer".to_string(), AmfData::String("FMS/3,0,1,123".to_string()));
        properties.insert("capabilities".to_string(), AmfData::Number(31 as f64));
        information.insert("level".to_string(), AmfData::String("status".to_string()));
        information.insert("code".to_string(), AmfData::String("NetConnection.Connect.Success".to_string()));
        information.insert("description".to_string(), AmfData::String("Connection succeeded.".to_string()));
        information.insert("objectEncoding".to_string(), AmfData::Number(0 as f64));

        let data = Data::Invoke(
            InvokeCommand::Response {
                command_name: "_result".to_string(),
                transaction_id: 1 as f64,
                properties,
                information
            }
        );
        let mut data_bytes: Vec<u8> = Vec::new();

        // この名前とシグネチャでチャンクデータをバイト列に変換する関数があると仮定する.
        encode_data(&mut data_bytes, data);

        let message_length = data_bytes.len() as u32;
    }

    Ok(())
}
```

そして, `encode_data` を以下のように実装する.

```rust
use std::{
    collections::{
        HashMap
    }
};

enum PingData {
    StreamBegin(u32)
}

enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Unknown
}

enum InvokeCommand {
    Request {
        command_name: String,
        transaction_id: f64,
        command_object: HashMap<String, AmfData>
    },
    Response {
        command_name: String,
        transaction_id: f64,
        properties: HashMap<String, AmfData>,
        information: HashMap<String, AmfData>
    }
}

enum Data {
    ChunkSize(u32),
    Ping(u16, PingData),
    ServerBandwidth(u32),
    ClientBandwidth(u32, u8),
    Invoke(InvokeCommand),
    Unknown(Vec<u8>)
}

fn encode_data(v: &mut Vec<u8>, data: Data) -> Vec<u8> {
    match data {
        Data::ChunkSize(chunk_size) => v.extend_from_slice(&chunk_size.to_be_bytes()),
        Data::Ping(ping_type, ping_data) => {
            v.extend_from_slice(&ping_type.to_be_bytes());

            match ping_data {
                PingData::StreamBegin(message_id) => v.extend_from_slice(&message_id.to_be_bytes())
            }
        },
        Data::ServerBandwidth(server_bandwidth) => v.extend_from_slice(&server_bandwidth.to_be_bytes()),
        Data::ClientBandwidth(client_bandwidth, limit) => {
            v.extend_from_slice(&client_bandwidth.to_be_bytes());
            v.push(limit);
        },
        Data::Invoke(invoke_command) => {
            match invoke_command {
                InvokeCommand::Response {
                    mut command_name,
                    transaction_id,
                    properties,
                    information
                } => {
                    v.push(2);
                    v.extend_from_slice(&(command_name.len() as u16).to_be_bytes());
                    v.append(command_name.as_mut_vec());
                    v.push(0);
                    v.extend_from_slice(&transaction_id.to_bits().to_be_bytes());
                    v.push(3);

                    for (mut name, value) in properties {
                        v.extend_from_slice(&(name.len() as u16).to_be_bytes());
                        v.append(name.as_mut_vec());

                        match value {
                            AmfData::Number(number) => {
                                v.push(0);
                                v.extend_from_slice(&number.to_bits().to_be_bytes());
                                },
                            AmfData::Boolean(boolean) => {
                                v.push(1);
                                v.push(boolean as u8);
                            },
                            AmfData::String(mut string) => {
                                v.push(2);
                                v.extend_from_slice(&(string.len() as u16).to_be_bytes());
                                v.append(string.as_mut_vec());
                            },
                            AmfData::Object(object) => {
                                // この部分も込みで後で関数化して再帰させる.
                            }
                        }
                    }

                    v.extend_from_slice(&[0, 0, 9]);
                    v.push(3);

                    for (mut name, value) in information {
                        v.extend_from_slice(&(name.len() as u16).to_be_bytes());
                        v.append(name.as_mut_vec());

                        match value {
                            AmfData::Number(number) => {
                                v.push(0);
                                v.extend_from_slice(&number.to_bits().to_be_bytes());
                            },
                            AmfData::Boolean(boolean) => {
                                v.push(1);
                                v.push(boolean as u8);
                            },
                            AmfData::String(mut string) => {
                                v.push(2);
                                v.extend_from_slice(&(string.len() as u16).to_be_bytes());
                                v.append(string.as_mut_vec());
                            },
                            AmfData::Object(object) => {
                                // 同上.
                            },
                            AmfData::Unknown => {
                                // 未定義の AMF データ型については, 現段階では何もしないこととする.
                            }
                        }
                    }

                    v.extend_from_slice(&[0, 0, 9]);
                },
                // 現時点では InvokeCommand::Request のエンコードについて考えないものとする.
                _ => {}
            }
        }
    }
}
```

上記の実装も変換過程に重複が見られるため, 以下のように関数化して処理の分岐を容易にしていく.

```rust
use std::{
    collections::{
        HashMap
    }
};

enum PingData {
    StreamBegin(u32)
}

enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Unknown
}

enum InvokeCommand {
    Request {
        command_name: String,
        transaction_id: f64,
        command_object: HashMap<String, AmfData>
    },
    Response {
        command_name: String,
        transaction_id: f64,
        properties: HashMap<String, AmfData>,
        information: HashMap<String, AmfData>
    }
}

enum Data {
    ChunkSize(u32),
    Ping(u16, PingData),
    ServerBandwidth(u32),
    ClientBandwidth(u32, u8),
    Invoke(InvokeCommand),
    Unknown(Vec<u8>)
}

fn encode_chunk_size(v: &mut Vec<u8>, chunk_size: u32) {
    v.extend_from_slice(&chunk_size.to_be_bytes());
}

fn encode_ping(v: &mut Vec<u8>, ping_type: u16, ping_data: PingData) {
    v.extend_from_slice(&ping_type.to_be_bytes());

    match ping_data {
        PingData::StreamBegin(message_id) => v.extend_from_slice(&message_id.to_be_bytes())
    }
}

fn encode_server_bandwidth(v: &mut Vec<u8>, server_bandwidth: u32) {
    v.extend_from_slice(&server_bandwidth.to_be_bytes());
}

fn encode_client_bandwidth(v: &mut Vec<u8>, client_bandwidth: u32, limit: u8) {
    v.extend_from_slice(&client_bandwidth.to_be_bytes());
    v.push(limit);
}

fn encode_amf_number(v: &mut Vec<u8>, number: f64) {
    v.push(0);
    v.extend_from_slice(&number.to_bits().to_be_bytes());
}

fn encode_amf_boolean(v: &mut Vec<u8>, boolean: bool) {
    v.push(1);
    v.push(boolean as u8);
}

fn encode_amf_string(v: &mut Vec<u8>, mut string: String) {
    v.push(2);
    v.extend_from_slice(&(string.len() as u16).to_be_bytes());
    v.append(string.as_mut_vec());
}

fn encode_amf_object(v: &mut Vec<u8>, object: HashMap<String, AmfData>) {
    v.push(3);

    for (mut name, value) in object {
        v.extend_from_slice(&(name.len() as u16).to_be_bytes());
        v.append(name.as_mut_vec());
        encode_amf_data(v, value);
    }

    v.extend_from_slice(&[0, 0, 9]);
}

fn encode_amf_data(v: &mut Vec<u8>, data: AmfData) {
    match data {
        AmfData::Number(number) => encode_amf_number(v, number),
        AmfData::Boolean(boolean) => encode_amf_boolean(v, boolean),
        AmfData::String(string) => encode_amf_string(v, string),
        AmfData::Object(object) => encode_amf_object(v, object),
        // まだ上記以外の AMF 型のデータを特定できていないため, 現段階では無視することとする.
        _ => {}
    }
}

fn encode_invoke(v: &mut Vec<u8>, invoke_command: InvokeCommand) {
    match invoke_command {
        InvokeCommand::Response {
            command_name,
            transaction_id,
            properties,
            information
        } => {
            encode_amf_string(v, command_name);
            encode_amf_number(v, transaction_id);
            encode_amf_object(v, properties);
            encode_amf_object(v, information);
        },
        // 現時点では InvokeCommand::Request のエンコードについて考えないものとする.
        _ => {}
    }
}

fn encode_data(v: &mut Vec<u8>, data: Data) {
    match data {
        Data::ChunkSize(chunk_size) => encode_chunk_size(v, chunk_size),
        Data::Ping(ping_type, ping_data) => encode_ping(v, ping_type, ping_data),
        Data::ServerBandwidth(server_bandwidth) => encode_server_bandwidth(v, server_bandwidth),
        Data::ClientBandwidth(client_bandwidth, limit) => encode_client_bandwidth(v, client_bandwidth, limit),
        Data::Invoke(invoke_command) => encode_invoke(v, invoke_command)
    }
}
```

これで各種チャンクデータを変換し, その長さを求める準備が整った.

##### バイト列への変換

次は各種ヘッダの変換処理も同様に関数化して他の返送チャンクの変換処理にも備える.

```rust
struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

impl BasicHeader {
    fn get_message_header_format(&self) -> u8 {
        self.message_header_format
    }

    fn get_chunk_id(&self) -> u16 {
        self.chunk_id
    }
}

struct MessageHeader {
    timestamp: Option<u32>,
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

impl MessageHeader {
    fn get_timestamp(&self) -> Option<u32> {
        self.timestamp
    }

    fn get_message_length(&self) -> Option<u32> {
        self.message_length
    }

    fn get_message_type(&self) -> Option<u8> {
        self.message_type
    }

    fn get_message_id(&self) -> Option<u32> {
        self.mmessage_id
    }
}

fn encode_basic_header(v: &mut Vec<u8>, basic_header: BasicHeader) {
    let message_header_format = basic_header.get_message_header_format();
    let chunk_id = basic_header.get_chunk_id();
    let mut second_bytes: Vec<u8> = Vec::new();
    let first_byte = if chunk_id > 319 {
        second_bytes.extend_from_slice(&chunk_id.to_le_bytes());
        (message_header_format << 6) | 1
    } else if chunk_id > 63 {
        second_bytes.push(chunk_id as u8);
        (message_header_format << 6) | 0
    } else {
        (message_header_format << 6) | chunk_id
    };

    v.push(first_byte);
    v.append(&mut second_bytes);
}

fn encode_message_header(v: &mut Vec<u8>, message_header: MessageHeader) {
    if let Some(timestamp) = message_header.get_timestamp() {
        v.extend_from_slice(&timestamp.to_be_bytes()[1..]);
    }

    if let Some(message_length) = message_header.get_message_length() {
        v.extend_from_slice(&message_length.to_be_bytes()[1..]);
    }

    if let Some(message_type) = message_header.get_message_type() {
        v.push(message_type);
    }

    if let some(message_id) = message_header.get_message_id() {
        v.extend_from_slice(&message_id.to_le_bytes());
    }
}

fn encode_extended_timestamp(v: &mut Vec<u8>, extended_timestamp: Option<u32>) {
    if let Some(extended_timestamp) = extended_timestamp {
        v.extend_from_slice(&extended_timestamp.to_be_bytes());
    }
}
```

ここで, 返送チャンクの変換処理を一つにまとめて, `main` 関数内の処理とも合流させる.

```rust
use std::{
    collections::{
        HashMap
    },
    io::{
        Result as IOResult
    },
    net::{
        TcpListener,
        TcpStream
    }
};

struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

impl BasicHeader {
    fn get_message_header_format(&self) -> u8 {
        self.message_header_format
    }

    fn get_chunk_id(&self) -> u16 {
        self.chunk_id
    }
}

struct MessageHeader {
    timestamp: Option<u32>,
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

impl MessageHeader {
    fn get_timestamp(&self) -> Option<u32> {
        self.timestamp
    }

    fn get_message_length(&self) -> Option<u32> {
        self.message_length
    }

    fn get_message_type(&self) -> Option<u8> {
        self.message_type
    }

    fn get_message_id(&self) -> Option<u32> {
        self.mmessage_id
    }
}

enum PingData {
    StreamBegin(u32)
}

enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Unknown
}

enum InvokeCommand {
    Request {
        command_name: String,
        transaction_id: f64,
        command_object: HashMap<String, AmfData>
    },
    Response {
        command_name: String,
        transaction_id: f64,
        properties: HashMap<String, AmfData>,
        information: HashMap<String, AmfData>
    }
}

enum Data {
    ChunkSize(u32),
    Ping(u16, PingData),
    ServerBandwidth(u32),
    ClientBandwidth(u32, u8),
    Invoke(InvokeCommand),
    Unknown(Vec<u8>)
}

fn encode_message_header(v: &mut Vec<u8>, message_header: MessageHeader) {
    if let Some(timestamp) = message_header.get_timestamp() {
        v.extend_from_slice(&timestamp.to_be_bytes()[1..]);
    }

    if let Some(message_length) = message_header.get_message_length() {
        v.extend_from_slice(&message_length.to_be_bytes()[1..]);
    }

    if let Some(message_type) = message_header.get_message_type() {
        v.push(message_type);
    }

    if let some(message_id) = message_header.get_message_id() {
        v.extend_from_slice(&message_id.to_le_bytes());
    }
}

fn encode_extended_timestamp(v: &mut Vec<u8>, extended_timestamp: Option<u32>) {
    if let Some(extended_timestamp) = extended_timestamp {
        v.extend_from_slice(&extended_timestamp.to_be_bytes());
    }
}

fn encode_chunk_size(v: &mut Vec<u8>, chunk_size: u32) {
    v.extend_from_slice(&chunk_size.to_be_bytes());
}

fn encode_ping(v: &mut Vec<u8>, ping_type: u16, ping_data: PingData) {
    v.extend_from_slice(&ping_type.to_be_bytes());

    match ping_data {
        PingData::StreamBegin(message_id) => v.extend_from_slice(&message_id.to_be_bytes())
    }
}

fn encode_server_bandwidth(v: &mut Vec<u8>, server_bandwidth: u32) {
    v.extend_from_slice(&server_bandwidth.to_be_bytes());
}

fn encode_client_bandwidth(v: &mut Vec<u8>, client_bandwidth: u32, limit: u8) {
    v.extend_from_slice(&client_bandwidth.to_be_bytes());
    v.push(limit);
}

fn encode_amf_number(v: &mut Vec<u8>, number: f64) {
    v.push(0);
    v.extend_from_slice(&number.to_bits().to_be_bytes());
}

fn encode_amf_boolean(v: &mut Vec<u8>, boolean: bool) {
    v.push(1);
    v.push(boolean as u8);
}

fn encode_amf_string(v: &mut Vec<u8>, mut string: String) {
    v.push(2);
    v.extend_from_slice(&(string.len() as u16).to_be_bytes());
    v.append(string.as_mut_vec());
}

fn encode_amf_object(v: &mut Vec<u8>, object: HashMap<String, AmfData>) {
    v.push(3);

    for (mut name, value) in object {
        v.extend_from_slice(&(name.len() as u16).to_be_bytes());
        v.append(name.as_mut_vec());
        encode_amf_data(v, value);
    }

    v.extend_from_slice(&[0, 0, 9]);
}

fn encode_amf_data(v: &mut Vec<u8>, data: AmfData) {
    match data {
        AmfData::Number(number) => encode_amf_number(v, number),
        AmfData::Boolean(boolean) => encode_amf_boolean(v, boolean),
        AmfData::String(string) => encode_amf_string(v, string),
        AmfData::Object(object) => encode_amf_object(v, object),
        // まだ上記以外の AMF 型のデータを特定できていないため, 現段階では無視することとする.
        _ => {}
    }
}

fn encode_invoke(v: &mut Vec<u8>, invoke_command: InvokeCommand) {
    match invoke_command {
        InvokeCommand::Response {
            command_name,
            transaction_id,
            properties,
            information
        } => {
            encode_amf_string(v, command_name);
            encode_amf_number(v, transaction_id);
            encode_amf_object(v, properties);
            encode_amf_object(v, information);
        },
        // 現時点では InvokeCommand::Request のエンコードについて考えないものとする.
        _ => {}
    }
}

fn encode_data(v: &mut Vec<u8>, data: Data) {
    match data {
        Data::ChunkSize(chunk_size) => encode_chunk_size(v, chunk_size),
        Data::Ping(ping_type, ping_data) => encode_ping(v, ping_type, ping_data),
        Data::ServerBandwidth(server_bandwidth) => encode_server_bandwidth(v, server_bandwidth),
        Data::ClientBandwidth(client_bandwidth, limit) => encode_client_bandwidth(v, client_bandwidth, limit),
        Data::Invoke(invoke_command) => encode_invoke(v, invoke_command)
    }
}

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        let mut stream = incoming?;
        /* ハンドシェイクは完了しているとみなす. */
        let received_chunk = receive_chunk(&mut stream)?;
        /* 返送チャンクの送信処理. */
        let mut properties: HashMap<String, AmfData> = HashMap::new();
        let mut information: HashMap<String, AmfData> = HashMap::new();

        properties.insert("fmsVer".to_string(), AmfData::String("FMS/3,0,1,123".to_string()));
        properties.insert("capabilities".to_string(), AmfData::Number(31 as f64));
        information.insert("level".to_string(), AmfData::String("status".to_string()));
        information.insert("code".to_string(), AmfData::String("NetConnection.Connect.Success".to_string()));
        information.insert("description".to_string(), AmfData::String("Connection succeeded.".to_string()));
        information.insert("objectEncoding".to_string(), AmfData::Number(0 as f64));

        let data = Data::Invoke(
            InvokeCommand::Response {
                command_name: "_result".to_string(),
                transaction_id: 1 as f64,
                properties,
                information
            }
        );
        let mut data_bytes: Vec<u8> = Vec::new();

        encode_data(&mut data_bytes, data);

        let message_length = data_bytes.len() as u32;
        let chunk_id: u16 = 3;
        let basic_header = BasicHeader {
            message_header_format: 0,
            chunk_id
        };
        let message_header = MessageHeader {
            timestamp: Some(0),
            message_length,
            message_type: 20,
            message_id: 0
        };
        let extended_timestamp: Option<u32> = None;
        let mut invoke_bytes: Vec<u8> = Vec::new();

        encode_basic_header(&mut invoke_bytes, basic_header);
        encode_message_header(&mut invoke_bytes, message_header);
        encode_extended_timestamp(&mut invoke_bytes, extended_timestamp);

        /* チャンクデータを append する処理に移る. */
    }

    Ok(())
}
```

これでチャンクデータまでのバイト列への変換は成功である. 次に, チャンクデータをバイト列に変換する例を以下に記す. ここで, その際の留意事項を改めて以下に記す.

チャンクメッセージヘッダ中のメッセージ長の値が:

* 所定のチャンクサイズ以下の場合は, メッセージ長と丁度同じサイズのチャンクデータを送信する.
* そうでない場合は, チャンクデータを所定のチャンクサイズ単位で区切り, それらの区切ったチャンクの間にはチャンク基本ヘッダと形式 3 のチャンクメッセージヘッダを挿入する. (つまりチャンク基本ヘッダのみを挿入する)

```rust
use std::{
    cmp::{
        min
    },
    io::{
        Result as IOResult
    },
    net::{
        TcpListener,
        TcpStream
    }
};

const DEFAULT_CHUNK_SIZE: u32 = 128;

// 変換処理中でバイト列に必要な分だけ同じデータを挿入するため, コピー可能にしておく.
// ちなみに, メンバのどこにもポインタ型を含んでいない構造体や列挙体には Copy トレイトを付与することができる.
// これにより, 構造体をそのままコピーする(Rust の場合はスタック上に再生成する)ことが可能となる.
#[derive(Clone, Copy)]
struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

impl BasicHeader {
    fn get_message_header_format(&self) -> u8 {
        self.message_header_format
    }

    fn get_chunk_id(&self) -> u16 {
        self.chunk_id
    }
}

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        let stream = incoming?;
        /* チャンクデータまでのバイト列への変換処理は完了しているとみなす. */
        let splits = if message_length <= DEFAULT_CHUNK_SIZE {
            0
        } else {
            message_length / DEFAULT_CHUNK_SIZE + (message_length % DEFAULT_CHUNK_SIZE != 0) as u32
        };

        if splits > 0 {
            let mut added: Vec<u8> = Vec::new();
            let basic_header = BasicHeader {
                message_header_format: 3,
                chunk_id
            };

            for i in 0..splits {
                // バイト列の先頭にうっかりヘッダを挿入しないようにする.
                if i > 0 {
                    encode_basic_header(&mut added, basic_header);
                }

                let start = (DEFAULT_CHUNK_SIZE * i) as usize;
                // 所定のチャンクサイズ（現在はデフォルト値をそのまま使用）と残りのチャンクデータのサイズの内, どちらか少ない方を採用する.
                // こうすることで, 端数分のチャンクデータも過不足なく送信できる.
                let end = start + min(DEFAULT_CHUNK_SIZE as usize, data_bytes[start..].len());

                added.extend_from_slice(&data_bytes[start..end]);
            }

            data_bytes = added;
        }

        invoke_bytes.append(&mut data_bytes);
    }

    Ok(())
}
```

これで Invoke(\_result) のチャンクをバイト列に変換する処理は完了である.

##### 返送チャンクの送信

ここで, 当該変換処理を一つにまとめ, 他の返送チャンクの変換も行い, 出来上がったバイト列をクライアント側に送信する.

```rust
use std::{
    cmp::{
        min
    },
    collections::{
        HashMap
    },
    io::{
        Result as IOResult,
        Write
    },
    net::{
        TcpListener,
        TcpStream
    }
};

const DEFAULT_CHUNK_SIZE: u32 = 128;
const DEFAULT_BANDWIDTH: u32 = 3000000;

#[derive(Clone, Copy)]
struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

impl BasicHeader {
    fn get_message_header_format(&self) -> u8 {
        self.message_header_format
    }

    fn get_chunk_id(&self) -> u16 {
        self.chunk_id
    }
}

// Option 型は, 格納している値が Copy 可能である場合はコンテナ自体にも Copy トレイトが付与される.
#[derive(Clone, Copy)]
struct MessageHeader {
    timestamp: Option<u32>,
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

impl MessageHeader {
    fn get_timestamp(&self) -> Option<u32> {
        self.timestamp
    }

    fn get_message_length(&self) -> Option<u32> {
        self.message_length
    }

    fn get_message_type(&self) -> Option<u8> {
        self.message_type
    }

    fn get_message_id(&self) -> Option<u32> {
        self.mmessage_id
    }
}

#[derive(Clone, Copy)]
enum PingData {
    StreamBegin(u32)
}

#[derive(Clone)]
enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Unknown
}

// String は Vec<u8> の Unicode 対応ラッパであり, HashMap も値の永続化のためにポインタレベルでのコピーを行っているため, Copy トレイトを付与できない.
#[derive(Clone)]
enum InvokeCommand {
    Request {
        command_name: String,
        transaction_id: f64,
        command_object: HashMap<String, AmfData>
    },
    Response {
        command_name: String,
        transaction_id: f64,
        properties: HashMap<String, AmfData>,
        information: HashMap<String, AmfData>
    }
}

// 一部に Vec が含まれるため, Copy トレイトを付与できない.
#[derive(Clone)]
enum Data {
    ChunkSize(u32),
    Ping(u16, PingData),
    ServerBandwidth(u32),
    ClientBandwidth(u32, u8),
    Invoke(InvokeCommand),
    Unknown(Vec<u8>)
}

struct Chunk {
    basic_header: BasicHeader,
    message_header: MessageHeader,
    extended_timestamp: Option<u32>,
    data: Data
}

// BasicHeader と MessageHeader は Copy トレイトを付与されたため, 参照でなくても返せるようになった.
impl Chunk {
    fn get_basic_header(&self) -> BasicHeader {
        self.basic_header
    }

    fn get_message_header(&self) -> MessageHeader {
        self.message_header
    }

    fn get_extended_timestamp(&self) -> Option<u32> {
        self.extended_timestamp
    }

    fn get_data(&self) -> &Data {
        &self.data
    }
}

fn encode_basic_header(v: &mut Vec<u8>, basic_header: BasicHeader) {
    let message_header_format = basic_header.get_message_header_format();
    let chunk_id = basic_header.get_chunk_id();
    let mut second_bytes: Vec<u8> = Vec::new();
    let first_byte = if chunk_id > 319 {
        second_bytes.extend_from_slice(&chunk_id.to_le_bytes());
        (message_header_format << 6) | 1
    } else if chunk_id > 63 {
        second_bytes.push(chunk_id as u8);
        (message_header_format << 6) | 0
    } else {
        (message_header_format << 6) | chunk_id
    };

    v.push(first_byte);
    v.append(&mut second_bytes);
}

fn encode_message_header(v: &mut Vec<u8>, message_header: MessageHeader) {
    if let Some(timestamp) = message_header.get_timestamp() {
        v.extend_from_slice(&timestamp.to_be_bytes()[1..]);
    }

    if let Some(message_length) = message_header.get_message_length() {
        v.extend_from_slice(&message_length.to_be_bytes()[1..]);
    }

    if let Some(message_type) = message_header.get_message_type() {
        v.push(message_type);
    }

    if let some(message_id) = message_header.get_message_id() {
        v.extend_from_slice(&message_id.to_le_bytes());
    }
}

fn encode_extended_timestamp(v: &mut Vec<u8>, extended_timestamp: Option<u32>) {
    if let Some(extended_timestamp) = extended_timestamp {
        v.extend_from_slice(&extended_timestamp.to_be_bytes());
    }
}

fn encode_chunk_size(v: &mut Vec<u8>, chunk_size: u32) {
    v.extend_from_slice(&chunk_size.to_be_bytes());
}

fn encode_ping(v: &mut Vec<u8>, ping_type: u16, ping_data: PingData) {
    v.extend_from_slice(&ping_type.to_be_bytes());

    match ping_data {
        PingData::StreamBegin(message_id) => v.extend_from_slice(&message_id.to_be_bytes())
    }
}

fn encode_server_bandwidth(v: &mut Vec<u8>, server_bandwidth: u32) {
    v.extend_from_slice(&server_bandwidth.to_be_bytes());
}

fn encode_client_bandwidth(v: &mut Vec<u8>, client_bandwidth: u32, limit: u8) {
    v.extend_from_slice(&client_bandwidth.to_be_bytes());
    v.push(limit);
}

fn encode_amf_number(v: &mut Vec<u8>, number: f64) {
    v.push(0);
    v.extend_from_slice(&number.to_bits().to_be_bytes());
}

fn encode_amf_boolean(v: &mut Vec<u8>, boolean: bool) {
    v.push(1);
    v.push(boolean as u8);
}

fn encode_amf_string(v: &mut Vec<u8>, mut string: String) {
    v.push(2);
    v.extend_from_slice(&(string.len() as u16).to_be_bytes());
    v.append(string.as_mut_vec());
}

fn encode_amf_object(v: &mut Vec<u8>, object: HashMap<String, AmfData>) {
    v.push(3);

    for (mut name, value) in object {
        v.extend_from_slice(&(name.len() as u16).to_be_bytes());
        v.append(name.as_mut_vec());
        encode_amf_data(v, value);
    }

    v.extend_from_slice(&[0, 0, 9]);
}

fn encode_amf_data(v: &mut Vec<u8>, data: AmfData) {
    match data {
        AmfData::Number(number) => encode_amf_number(v, number),
        AmfData::Boolean(boolean) => encode_amf_boolean(v, boolean),
        AmfData::String(string) => encode_amf_string(v, string),
        AmfData::Object(object) => encode_amf_object(v, object),
        // まだ上記以外の AMF 型のデータを特定できていないため, 現段階では無視することとする.
        _ => {}
    }
}

fn encode_invoke(v: &mut Vec<u8>, invoke_command: InvokeCommand) {
    match invoke_command {
        InvokeCommand::Response {
            command_name,
            transaction_id,
            properties,
            information
        } => {
            encode_amf_string(v, command_name);
            encode_amf_number(v, transaction_id);
            encode_amf_object(v, properties);
            encode_amf_object(v, information);
        },
        // 現時点では InvokeCommand::Request のエンコードについて考えないものとする.
        _ => {}
    }
}

fn encode_data(v: &mut Vec<u8>, data: Data) {
    match data {
        Data::ChunkSize(chunk_size) => encode_chunk_size(v, chunk_size),
        Data::Ping(ping_type, ping_data) => encode_ping(v, ping_type, ping_data),
        Data::ServerBandwidth(server_bandwidth) => encode_server_bandwidth(v, server_bandwidth),
        Data::ClientBandwidth(client_bandwidth, limit) => encode_client_bandwidth(v, client_bandwidth, limit),
        Data::Invoke(invoke_command) => encode_invoke(v, invoke_command)
    }
}

fn encode_chunk(v: &mut Vec<u8>, chunk: Chunk) {
    let mut data_bytes: Vec<u8> = Vec::new();

    encode_data(&mut data_bytes, chunk.get_data().clone());

    let message_length = if let Some(message_length) = chunk.get_message_header().get_message_length() {
        message_length
    } else {
        data_bytes.len() as u32
    };
    let splits = if message_length <= DEFAULT_CHUNK_SIZE {
        0
    } else {
        message_length / DEFAULT_CHUNK_SIZE + (message_length % DEFAULT_CHUNK != 0) as u32
    };

    if splits > 0 {
        let mut added: Vec<u8> = Vec::new();
        let basic_header = BasicHeader {
            message_header_format: 3,
            // Chunk 構造体の中から参照できるため, 今後はそれを利用する.
            chunk_id: chunk.get_basic_header().get_chunk_id()
        };

        for i in 0..splits {
            if i > 0 {
                encode_basic_header(&mut added, basic_header);
            }

            let start = (DEFAULT_CHUNK_SIZE * i) as usize;
            let end = start + min(DEFAULT_CHUNK_SIZE, data_bytes[start..].len());

            added.extend_from_slice(&data_bytes[start..end]);
        }

        data_bytes = added;
    }

    encode_basic_header(v, chunk.get_basic_header());
    encode_message_header(
        v,
        MessageHeader {
            message_length,
            // 構造体の部分更新構文である.
            // これにより, 正確なメッセージ長を上書きしている.
            ..chunk.get_message_header()
        }
    );
    encode_extended_timestamp(v, chunk.get_extended_timestamp());
    // チャンク基本ヘッダを挟むために既にバイト列へ変換済みである.
    v.append(&mut data_bytes);
}

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        let mut stream = incoming?;
        /* ハンドシェイクは完了しているとみなす. */
        let received_chunk = receive_chunk(&mut stream)?;
        /* 返送チャンクの送信処理. */
        let mut properties: HashMap<String, AmfData> = HashMap::new();
        let mut information: HashMap<String, AmfData> = HashMap::new();

        properties.insert("fmsVer".to_string(), AmfData::String("FMS/3,0,1,123".to_string()));
        properties.insert("capabilities".to_string(), AmfData::Number(31 as f64));
        information.insert("level".to_string(), AmfData::String("status".to_string()));
        information.insert("code".to_string(), AmfData::String("NetConnection.Connect.Success".to_string()));
        information.insert("description".to_string(), AmfData::String("Connection succeeded.".to_string()));
        information.insert("objectEncoding".to_string(), AmfData::Number(0 as f64));

        let invoke = Chunk {
            basic_header: BasicHeader {
                message_header_format: 0,
                chunk_id: 3
            },
            message_header: MessageHeader {
                timestamp: Some(0),
                message_length: None,
                message_type: Some(20),
                message_id: Some(0)
            },
            extended_timestamp: None,
            data: Data::Invoke(
                InvokeCommand::Response {
                    command_name: "_result".to_string(),
                    transaction_id: 1 as f64,
                    properties,
                    information
                }
            )
        };
        let mut invoke_bytes: Vec<u8> = Vec::new();
        let server_bandwidth = Chunk {
            basic_header: BasicHeader {
                message_header_format: 0,
                chunk_id: 2
            },
            message_header: MessageHeader {
                timestamp: Some(0),
                message_length: Some(4),
                message_type: Some(5),
                message_id: Some(0)
            },
            extended_timestamp: None,
            data: Data::ServerBandwidth(DEFAULT_BANDWIDTH)
        };
        let mut server_bandwidth_bytes: Vec<u8> = Vec::new();
        let client_bandwidth = Chunk {
            basic_header: BasicHeader {
                message_header_format: 0,
                chunk_id: 2
            },
            message_header: MessageHeader {
                timestamp: Some(0),
                message_length: Some(5),
                message_type: Some(6),
                message_id: Some(0)
            },
            extended_timestamp: None,
            data: Data::ClientBandwidth(DEFAULT_BANDWIDTH)
        };
        let mut client_bandwidth_bytes: Vec<u8> = Vec::new();
        let ping = Chunk {
            basic_header: BasicHeader {
                message_header_format: 0,
                chunk_id: 2
            },
            message_header: {
                timestamp: Some(0),
                message_length: Some(6),
                message_type: Some(4),
                message_id: Some(0)
            },
            extended_timestamp: None,
            data: Data::Ping(
                0,
                // この時点でのメッセージ ID は必然的に 0 である.
                PingData::StreamBegin(0)
            )
        };
        let mut ping_bytes: Vec<u8> = Vec::new();
        let chunk_size = Chunk {
            basic_header: BasicHeader {
                message_header_format: 0,
                chunk_id: 2
            },
            message_header: MessageHeader {
                timestamp: Some(0),
                message_length: Some(4),
                message_type: Some(1),
                message_id: Some(0)
            },
            extended_timestamp: None,
            data: Data::ChunkSize(DEFAULT_CHUNK_SIZE)
        };
        let mut chunk_size_bytes: Vec<u8> = Vec::new();

        encode_chunk(&mut invoke_bytes, invoke);
        encode_chunk(&mut server_bandwidth_bytes, server_bandwidth);
        encode_chunk(&mut client_bandwidth_bytes, client_bandwidth);
        encode_chunk(&mut ping_bytes, ping);
        encode_chunk(&mut chunk_size_bytes, chunk_size);
        stream.write(invoke_bytes.as_slice())?;
        stream.write(server_bandwidth_bytes.as_slice())?;
        stream.write(client_bandwidth_bytes.as_slice())?;
        stream.write(ping_bytes.as_slice())?;
        stream.write(chunk_size.as_slice())?;
        stream.write(invoke_bytes.as_slice()).map(|_| ())

        /* Invoke(releaseStream), Invoke(FCPublish) および Invoke(createStream) の受信処理に移る. */
    }

    Ok(())
}
```

上記の実装でエラーが一つも発生しなければ, Invoke(connect) リクエストへの返送処理は完了である. ここで, 当該処理を関数化して全体を見やすくする.

```rust
use std::{
    cmp::{
        min
    },
    collections::{
        HashMap
    },
    io::{
        Result as IOResult,
        Write
    },
    net::{
        TcpListener,
        TcpStream
    }
};

const DEFAULT_CHUNK_SIZE: u32 = 128;
const DEFAULT_BANDWIDTH: u32 = 3000000;

#[derive(Clone, Copy)]
struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

impl BasicHeader {
    fn get_message_header_format(&self) -> u8 {
        self.message_header_format
    }

    fn get_chunk_id(&self) -> u16 {
        self.chunk_id
    }
}

#[derive(Clone, Copy)]
struct MessageHeader {
    timestamp: Option<u32>,
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

impl MessageHeader {
    fn get_timestamp(&self) -> Option<u32> {
        self.timestamp
    }

    fn get_message_length(&self) -> Option<u32> {
        self.message_length
    }

    fn get_message_type(&self) -> Option<u8> {
        self.message_type
    }

    fn get_message_id(&self) -> Option<u32> {
        self.mmessage_id
    }
}

#[derive(Clone, Copy)]
enum PingData {
    StreamBegin(u32)
}

#[derive(Clone)]
enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Unknown
}

#[derive(Clone)]
enum InvokeCommand {
    Request {
        command_name: String,
        transaction_id: f64,
        command_object: HashMap<String, AmfData>
    },
    Response {
        command_name: String,
        transaction_id: f64,
        properties: HashMap<String, AmfData>,
        information: HashMap<String, AmfData>
    }
}

#[derive(Clone)]
enum Data {
    ChunkSize(u32),
    Ping(u16, PingData),
    ServerBandwidth(u32),
    ClientBandwidth(u32, u8),
    Invoke(InvokeCommand),
    Unknown(Vec<u8>)
}

struct Chunk {
    basic_header: BasicHeader,
    message_header: MessageHeader,
    extended_timestamp: Option<u32>,
    data: Data
}

impl Chunk {
    fn get_basic_header(&self) -> BasicHeader {
        self.basic_header
    }

    fn get_message_header(&self) -> MessageHeader {
        self.message_header
    }

    fn get_extended_timestamp(&self) -> Option<u32> {
        self.extended_timestamp
    }

    fn get_data(&self) -> &Data {
        &self.data
    }
}

fn encode_basic_header(v: &mut Vec<u8>, basic_header: BasicHeader) {
    let message_header_format = basic_header.get_message_header_format();
    let chunk_id = basic_header.get_chunk_id();
    let mut second_bytes: Vec<u8> = Vec::new();
    let first_byte = if chunk_id > 319 {
        second_bytes.extend_from_slice(&chunk_id.to_le_bytes());
        (message_header_format << 6) | 1
    } else if chunk_id > 63 {
        second_bytes.push(chunk_id as u8);
        (message_header_format << 6) | 0
    } else {
        (message_header_format << 6) | chunk_id
    };

    v.push(first_byte);
    v.append(&mut second_bytes);
}

fn encode_message_header(v: &mut Vec<u8>, message_header: MessageHeader) {
    if let Some(timestamp) = message_header.get_timestamp() {
        v.extend_from_slice(&timestamp.to_be_bytes()[1..]);
    }

    if let Some(message_length) = message_header.get_message_length() {
        v.extend_from_slice(&message_length.to_be_bytes()[1..]);
    }

    if let Some(message_type) = message_header.get_message_type() {
        v.push(message_type);
    }

    if let some(message_id) = message_header.get_message_id() {
        v.extend_from_slice(&message_id.to_le_bytes());
    }
}

fn encode_extended_timestamp(v: &mut Vec<u8>, extended_timestamp: Option<u32>) {
    if let Some(extended_timestamp) = extended_timestamp {
        v.extend_from_slice(&extended_timestamp.to_be_bytes());
    }
}

fn encode_chunk_size(v: &mut Vec<u8>, chunk_size: u32) {
    v.extend_from_slice(&chunk_size.to_be_bytes());
}

fn encode_ping(v: &mut Vec<u8>, ping_type: u16, ping_data: PingData) {
    v.extend_from_slice(&ping_type.to_be_bytes());

    match ping_data {
        PingData::StreamBegin(message_id) => v.extend_from_slice(&message_id.to_be_bytes())
    }
}

fn encode_server_bandwidth(v: &mut Vec<u8>, server_bandwidth: u32) {
    v.extend_from_slice(&server_bandwidth.to_be_bytes());
}

fn encode_client_bandwidth(v: &mut Vec<u8>, client_bandwidth: u32, limit: u8) {
    v.extend_from_slice(&client_bandwidth.to_be_bytes());
    v.push(limit);
}

fn encode_amf_number(v: &mut Vec<u8>, number: f64) {
    v.push(0);
    v.extend_from_slice(&number.to_bits().to_be_bytes());
}

fn encode_amf_boolean(v: &mut Vec<u8>, boolean: bool) {
    v.push(1);
    v.push(boolean as u8);
}

fn encode_amf_string(v: &mut Vec<u8>, mut string: String) {
    v.push(2);
    v.extend_from_slice(&(string.len() as u16).to_be_bytes());
    v.append(string.as_mut_vec());
}

fn encode_amf_object(v: &mut Vec<u8>, object: HashMap<String, AmfData>) {
    v.push(3);

    for (mut name, value) in object {
        v.extend_from_slice(&(name.len() as u16).to_be_bytes());
        v.append(name.as_mut_vec());
        encode_amf_data(v, value);
    }

    v.extend_from_slice(&[0, 0, 9]);
}

fn encode_amf_data(v: &mut Vec<u8>, data: AmfData) {
    match data {
        AmfData::Number(number) => encode_amf_number(v, number),
        AmfData::Boolean(boolean) => encode_amf_boolean(v, boolean),
        AmfData::String(string) => encode_amf_string(v, string),
        AmfData::Object(object) => encode_amf_object(v, object),
        // まだ上記以外の AMF 型のデータを特定できていないため, 現段階では無視することとする.
        _ => {}
    }
}

fn encode_invoke(v: &mut Vec<u8>, invoke_command: InvokeCommand) {
    match invoke_command {
        InvokeCommand::Response {
            command_name,
            transaction_id,
            properties,
            information
        } => {
            encode_amf_string(v, command_name);
            encode_amf_number(v, transaction_id);
            encode_amf_object(v, properties);
            encode_amf_object(v, information);
        },
        // 現時点では InvokeCommand::Request のエンコードについて考えないものとする.
        _ => {}
    }
}

fn encode_data(v: &mut Vec<u8>, data: Data) {
    match data {
        Data::ChunkSize(chunk_size) => encode_chunk_size(v, chunk_size),
        Data::Ping(ping_type, ping_data) => encode_ping(v, ping_type, ping_data),
        Data::ServerBandwidth(server_bandwidth) => encode_server_bandwidth(v, server_bandwidth),
        Data::ClientBandwidth(client_bandwidth, limit) => encode_client_bandwidth(v, client_bandwidth, limit),
        Data::Invoke(invoke_command) => encode_invoke(v, invoke_command)
    }
}

fn encode_chunk(v: &mut Vec<u8>, chunk: Chunk) {
    let mut data_bytes: Vec<u8> = Vec::new();

    encode_data(&mut data_bytes, chunk.get_data().clone());

    let message_length = if let Some(message_length) = chunk.get_message_header().get_message_length() {
        message_length
    } else {
        data_bytes.len() as u32
    };
    let splits = if message_length <= DEFAULT_CHUNK_SIZE {
        0
    } else {
        message_length / DEFAULT_CHUNK_SIZE + (message_length % DEFAULT_CHUNK != 0) as u32
    };

    if splits > 0 {
        let mut added: Vec<u8> = Vec::new();
        let basic_header = BasicHeader {
            message_header_format: 3,
            chunk_id: chunk.get_basic_header().get_chunk_id()
        };

        for i in 0..splits {
            if i > 0 {
                encode_basic_header(&mut added, basic_header);
            }

            let start = (DEFAULT_CHUNK_SIZE * i) as usize;
            let end = start + min(DEFAULT_CHUNK_SIZE, data_bytes[start..].len());

            added.extend_from_slice(&data_bytes[start..end]);
        }

        data_bytes = added;
    }

    encode_basic_header(v, chunk.get_basic_header());
    encode_message_header(
        v,
        MessageHeader {
            message_length,
            ..chunk.get_message_header()
        }
    );
    encode_extended_timestamp(v, chunk.get_extended_timestamp());
    v.append(&mut data_bytes);
}

fn send_connect_response(stream: &mut TcpStream) -> IOResult<()> {
    let mut properties: HashMap<String, AmfData> = HashMap::new();
    let mut information: HashMap<String, AmfData> = HashMap::new();

    properties.insert("fmsVer".to_string(), AmfData::String("FMS/3,0,1,123".to_string()));
    properties.insert("capabilities".to_string(), AmfData::Number(31 as f64));
    information.insert("level".to_string(), AmfData::String("status".to_string()));
    information.insert("code".to_string(), AmfData::String("NetConnection.Connect.Success".to_string()));
    information.insert("description".to_string(), AmfData::String("Connection succeeded.".to_string()));
    information.insert("objectEncoding".to_string(), AmfData::Number(0 as f64));

    let invoke = Chunk {
        basic_header: BasicHeader {
            message_header_format: 0,
            chunk_id: 3
        },
        message_header: MessageHeader {
            timestamp: Some(0),
            message_length: None,
            message_type: Some(20),
            message_id: Some(0)
        },
        extended_timestamp: None,
        data: Data::Invoke(
            InvokeCommand::Response {
                command_name: "_result".to_string(),
                transaction_id: 1 as f64,
                properties,
                information
            }
        )
    };
    let mut invoke_bytes: Vec<u8> = Vec::new();
    let server_bandwidth = Chunk {
        basic_header: BasicHeader {
            message_header_format: 0,
            chunk_id: 2
        },
        message_header: MessageHeader {
            timestamp: Some(0),
            message_length: Some(4),
            message_type: Some(5),
            message_id: Some(0)
        },
        extended_timestamp: None,
        data: Data::ServerBandwidth(DEFAULT_BANDWIDTH)
    };
    let mut server_bandwidth_bytes: Vec<u8> = Vec::new();
    let client_bandwidth = Chunk {
        basic_header: BasicHeader {
            message_header_format: 0,
            chunk_id: 2
        },
        message_header: MessageHeader {
            timestamp: Some(0),
            message_length: Some(5),
            message_type: Some(6),
            message_id: Some(0)
        },
        extended_timestamp: None,
        data: Data::ClientBandwidth(DEFAULT_BANDWIDTH)
    };
    let mut client_bandwidth_bytes: Vec<u8> = Vec::new();
    let ping = Chunk {
        basic_header: BasicHeader {
            message_header_format: 0,
            chunk_id: 2
        },
        message_header: {
            timestamp: Some(0),
            message_length: Some(6),
            message_type: Some(4),
            message_id: Some(0)
        },
        extended_timestamp: None,
        data: Data::Ping(
            0,
            PingData::StreamBegin(0)
        )
    };
    let mut ping_bytes: Vec<u8> = Vec::new();
    let chunk_size = Chunk {
        basic_header: BasicHeader {
            message_header_format: 0,
            chunk_id: 2
        },
        message_header: MessageHeader {
            timestamp: Some(0),
            message_length: Some(4),
            message_type: Some(1),
            message_id: Some(0)
        },
        extended_timestamp: None,
        data: Data::ChunkSize(DEFAULT_CHUNK_SIZE)
    };
    let mut chunk_size_bytes: Vec<u8> = Vec::new();

    encode_chunk(&mut invoke_bytes, invoke);
    encode_chunk(&mut server_bandwidth_bytes, server_bandwidth);
    encode_chunk(&mut client_bandwidth_bytes, client_bandwidth);
    encode_chunk(&mut ping_bytes, ping);
    encode_chunk(&mut chunk_size_bytes, chunk_size);
    stream.write(invoke_bytes.as_slice())?;
    stream.write(server_bandwidth_bytes.as_slice())?;
    stream.write(client_bandwidth_bytes.as_slice())?;
    stream.write(ping_bytes.as_slice())?;
    stream.write(chunk_size.as_slice())?;
    stream.write(invoke_bytes.as_slice()).map(|_| ())
}

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        let mut stream = incoming?;
        /* ハンドシェイクは完了しているとみなす. */
        let received_chunk = receive_chunk(&mut stream)?;

        send_connect_response(&mut stream)?;

        /* Invoke(releaseStream), Invoke(FCPublish) および Invoke(createStream) の受信処理に移る. */
    }

    Ok(())
}
```

### releaseStream, FCPublish, createStream

サーバ側がクライアント側から受信した Invoke(connect) への返送を完了させると, 次にクライアント側はサーバ側にそれぞれ以下のチャンクを送信する.

* releaseStream
* FCPublish
* createStream

上記チャンクに入力されている値を以下に記す.

|コマンド名   |チャンクストリーム ID|タイムスタンプ|メッセージ長|メッセージ種類 ID|メッセージストリーム ID|チャンクデータ                                                   |
| :---------- | ------------------: | -----------: | ---------: | --------------: | --------------------: | :-------------------------------------------------------------- |
|releaseStream|3                    |0             |?           |20               |0                      | * コマンド名: releaseStream                                     | \
|             |                     |              |            |                 |                       | * トランザクション ID: 2 (おそらく)                             | \
|             |                     |              |            |                 |                       | * AMF における Null                                             | \
|             |                     |              |            |                 |                       | * playpath: rtmp://example.com/appName/playpath 中の *playpath* |
|FCPublish    |3                    |0             |?           |20               |\-                     | * コマンド名: FCPublish                                         | \
|             |                     |              |            |                 |                       | * トランザクション ID: 3 (おそらく)                             | \
|             |                     |              |            |                 |                       | * AMF における Null                                             | \
|             |                     |              |            |                 |                       | * playpath: releaseStream と同じ値                              |
|createStream |3                    |\-            |\-          |\-               |\-                     | * コマンド名: createStream                                      | \
|             |                     |              |            |                 |                       | * トランザクション ID: 4 (おそらく)                             | \
|             |                     |              |            |                 |                       | * AMF における Null                                             | 

上記から, コマンドによってはチャンクメッセージヘッダのフィールドが欠ける(もしくはチャンクメッセージヘッダ自体が入力されていない)ことを説明できる. これらは, チャンクメッセージヘッダの形式が変化していることを意味している. 形式ごとのチャンクメッセージヘッダのフィールドを以下に記す.

|チャンクメッセージヘッダの形式|タイムスタンプ    |メッセージ長      |メッセージの種類  |メッセージストリーム ID|
| ---------------------------: | :--------------: | :--------------: | :--------------: | :--------------------: |
|0                             |:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:    |
|1                             |:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|\-                    |
|2                             |:heavy_check_mark:|\-                |\-                |\-                    |
|3                             |\-                |\-                |\-                |\-                    |

公式ドキュメント[^RTMP-Specification-1.0]では, 形式 0 以外のチャンクメッセージヘッダを受信した時は直前に受信した**チャンクストリーム ID が等しい**チャンクから欠けている情報を参照するように指定されている. つまり, **そのフィールドについては直前のチャンクに入力されていた値と同じである**ようだ.

#### releaseStream, FCPublish, createStream コマンドの受信と返送チャンクの送信

次に, 上記の各種チャンクを受信する例を以下に記す.

```rust
use std::{
    cmp::{
        min
    },
    collections::{
        HashMap
    },
    io::{
        Read,
        Result as IOResult
    },
    net::{
        TcpListener,
        TcpStream
    }
};

const DEFAULT_CHUNK_SIZE: u32 = 128;
const DEFAULT_BANDWIDTH: u32 = 3000000;

#[derive(Clone, Copy)]
struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

impl BasicHeader {
    fn get_message_header_format(&self) -> u8 {
        self.message_header_format
    }

    fn get_chunk_id(&self) -> u16 {
        self.chunk_id
    }
}

#[derive(Clone, Copy)]
struct MessageHeader {
    timestamp: Option<u32>,
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

impl MessageHeader {
    fn get_timestamp(&self) -> Option<u32> {
        self.timestamp
    }

    fn get_message_length(&self) -> Option<u32> {
        self.message_length
    }

    fn get_message_type(&self) -> Option<u8> {
        self.message_type
    }

    fn get_message_id(&self) -> Option<u32> {
        self.mmessage_id
    }
}

#[derive(Clone, Copy)]
enum PingData {
    StreamBegin(u32)
}

#[derive(Clone)]
enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    // releaseStream, FCPublish および createStream がそれぞれコマンドオブジェクトと置き換える.
    Null,
    Unknown
}

#[derive(Clone)]
enum ConnectCommand {
    Request {
        transaction_id: f64,
        command_object: HashMap<String, AmfData>
    },
    Response {
        transaction_id: f64,
        properties: HashMap<String, AmfData>,
        information: HashMap<String, AmfData>
    }
}

#[derive(Clone)]
enum ReleaseStreamCommand {
    Request {
        transaction_id: f64,
        playpath: String
    },
    Response {
        transaction_id: f64
    }
}

impl ReleaseStreamCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        // 要求チャンクが持っているトランザクション ID だけが欲しい.
        match *self {
            ReleaseStreamCommand::Request {
                transaction_id,
                play_path: _
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum CreateStreamCommand {
    // createStream の要求チャンクは Null の部分を除けばトランザクション ID のみ.
    Request {
        transaction_id: f64
    },
    // 返送チャンクはトランザクション ID とメッセージストリーム ID を入力する.
    Response {
        transaction_id: f64,
        message_id: f64
    }
}

impl CreateStreamCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        // 同上
        match *self {
            CreateStreamCommand::Request {
                transaction_id
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum NetConnectionCommand {
    Connect(ConnectCommand),
    ReleaseStream(ReleaseStreamCommand),
    CreateStream(CreateStreamCommand)
}

#[derive(Clone)]
enum FCPublishCommand {
    Request {
        transaction_id: f64,
        playpath: String
    },
    // FCPublish の返送チャンクはコマンド名(onFCPublish)のみ.
    Response
}

impl FCPublishCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        // 同上
        match *self {
            FCPublishCommand::Request {
                transaction_id,
                playpath: _
            } => Some(transaction_id),
            _ => None
        }
    }
}

// コマンドのパターンが増えたため, 再構築する.
#[derive(Clone)]
enum InvokeCommand {
    NetConnection(NetConnectionCommand),
    FCPublish(FCPublishCommand)
}

#[derive(Clone)]
enum Data {
    ChunkSize(u32),
    Ping(u16, PingData),
    ServerBandwidth(u32),
    ClientBandwidth(u32, u8),
    Invoke(InvokeCommand),
    Unknown(Vec<u8>)
}

struct Chunk {
    basic_header: BasicHeader,
    message_header: MessageHeader,
    extended_timestamp: Option<u32>,
    data: Data
}

impl Chunk {
    fn get_basic_header(&self) -> BasicHeader {
        self.basic_header
    }

    fn get_message_header(&self) -> MessageHeader {
        self.message_header
    }

    fn get_extended_timestamp(&self) -> Option<u32> {
        self.extended_timestamp
    }

    fn get_data(&self) -> &Data {
        &self.data
    }
}

fn encode_basic_header(v: &mut Vec<u8>, basic_header: BasicHeader) {
    let message_header_format = basic_header.get_message_header_format();
    let chunk_id = basic_header.get_chunk_id();
    let mut second_bytes: Vec<u8> = Vec::new();
    let first_byte = if chunk_id > 319 {
        second_bytes.extend_from_slice(&chunk_id.to_le_bytes());
        (message_header_format << 6) | 1
    } else if chunk_id > 63 {
        second_bytes.push(chunk_id as u8);
        (message_header_format << 6) | 0
    } else {
        (message_header_format << 6) | chunk_id
    };

    v.push(first_byte);
    v.append(&mut second_bytes);
}

fn encode_message_header(v: &mut Vec<u8>, message_header: MessageHeader) {
    if let Some(timestamp) = message_header.get_timestamp() {
        v.extend_from_slice(&timestamp.to_be_bytes()[1..]);
    }

    if let Some(message_length) = message_header.get_message_length() {
        v.extend_from_slice(&message_length.to_be_bytes()[1..]);
    }

    if let Some(message_type) = message_header.get_message_type() {
        v.push(message_type);
    }

    if let some(message_id) = message_header.get_message_id() {
        v.extend_from_slice(&message_id.to_le_bytes());
    }
}

fn encode_extended_timestamp(v: &mut Vec<u8>, extended_timestamp: Option<u32>) {
    if let Some(extended_timestamp) = extended_timestamp {
        v.extend_from_slice(&extended_timestamp.to_be_bytes());
    }
}

fn encode_chunk_size(v: &mut Vec<u8>, chunk_size: u32) {
    v.extend_from_slice(&chunk_size.to_be_bytes());
}

fn encode_ping(v: &mut Vec<u8>, ping_type: u16, ping_data: PingData) {
    v.extend_from_slice(&ping_type.to_be_bytes());

    match ping_data {
        PingData::StreamBegin(message_id) => v.extend_from_slice(&message_id.to_be_bytes())
    }
}

fn encode_server_bandwidth(v: &mut Vec<u8>, server_bandwidth: u32) {
    v.extend_from_slice(&server_bandwidth.to_be_bytes());
}

fn encode_client_bandwidth(v: &mut Vec<u8>, client_bandwidth: u32, limit: u8) {
    v.extend_from_slice(&client_bandwidth.to_be_bytes());
    v.push(limit);
}

fn encode_amf_number(v: &mut Vec<u8>, number: f64) {
    v.push(0);
    v.extend_from_slice(&number.to_bits().to_be_bytes());
}

fn encode_amf_boolean(v: &mut Vec<u8>, boolean: bool) {
    v.push(1);
    v.push(boolean as u8);
}

fn encode_amf_string(v: &mut Vec<u8>, mut string: String) {
    v.push(2);
    v.extend_from_slice(&(string.len() as u16).to_be_bytes());
    v.append(string.as_mut_vec());
}

fn encode_amf_object(v: &mut Vec<u8>, object: HashMap<String, AmfData>) {
    v.push(3);

    for (mut name, value) in object {
        v.extend_from_slice(&(name.len() as u16).to_be_bytes());
        v.append(name.as_mut_vec());
        encode_amf_data(v, value);
    }

    v.extend_from_slice(&[0, 0, 9]);
}

fn encode_amf_null(v: &mut Vec<u8>) {
    v.push(5);
}

fn encode_amf_data(v: &mut Vec<u8>, data: AmfData) {
    match data {
        AmfData::Number(number) => encode_amf_number(v, number),
        AmfData::Boolean(boolean) => encode_amf_boolean(v, boolean),
        AmfData::String(string) => encode_amf_string(v, string),
        AmfData::Object(object) => encode_amf_object(v, object),
        AmfData::Null => encode_amf_null(v),
        // まだ上記以外の AMF 型のデータを特定できていないため, 現段階では無視することとする.
        _ => {}
    }
}

fn encode_connect(v: &mut Vec<u8>, connect_command: ConnectCommand) {
    match connect_command {
        // パターンの増加に対応してそれぞれ名前を付けたため, コマンド名を格納する必要がなくなった.
        Connect::Response {
            transaction_id,
            properties,
            information
        } => {
            encode_amf_string(v, "_result".to_string());
            encode_amf_number(v, transaction_id);
            encode_amf_object(v, properties);
            encode_amf_object(v, information);
        },
        _ => {}
    }
}

fn encode_release_stream(v: &mut Vec<u8>, release_stream_command: ReleaseStreamCommand) {
    match release_stream_command {
        ReleaseStreamCommand::Response {
            transaction_id
        } => {
            encode_amf_string(v, "_result".to_string());
            encode_amf_number(v, transaction_id);
            encode_amf_null(v);
        },
        _ => {}
    }
}

fn encode_create_stream(v: &mut Vec<u8>, create_stream_command: CreateStreamCommand) {
    match create_stream_command {
        CreateStreamCommand::Response {
            transaction_id,
            message_id
        } => {
            encode_amf_string(v, "_result".to_string);
            encode_amf_number(v, transaction_id);
            encode_amf_null(v);
            encode_amf_number(v, message_id);
        },
        _ => {}
    }
}

fn encode_net_connection(v: &mut Vec<u8>, net_connection_command: NetConnectionCommand) {
    match net_connection_command {
        Connect(connect_command) => encode_connect(v, connect_command),
        ReleaseStream(release_stream_command) => encode_release_stream(v, release_stream_command),
        CreateStream(create_stream_command) => encode_create_stream(v, create_stream_command)
    }
}

fn encode_fc_publish(v: &mut Vec<u8>, fc_publish_command: FCPublishCommand) {
    match fc_publish_command {
        FCPublishCommand::Response => encode_amf_string(v, "onFCPublish".to_string()),
        _ => {}
    }
}

fn encode_invoke(v: &mut Vec<u8>, invoke_command: InvokeCommand) {
    match invoke_command {
        InvokeCommand::NetConnection(net_connection_command) => encode_net_connection(v, net_connection_command),
        InvokeCommand::FCPublish(fc_publish_command) => encode_fc_publish(v, fc_publish_command)
    }
}

fn encode_data(v: &mut Vec<u8>, data: Data) {
    match data {
        Data::ChunkSize(chunk_size) => encode_chunk_size(v, chunk_size),
        Data::Ping(ping_type, ping_data) => encode_ping(v, ping_type, ping_data),
        Data::ServerBandwidth(server_bandwidth) => encode_server_bandwidth(v, server_bandwidth),
        Data::ClientBandwidth(client_bandwidth, limit) => encode_client_bandwidth(v, client_bandwidth, limit),
        Data::Invoke(invoke_command) => encode_invoke(v, invoke_command)
    }
}

fn encode_chunk(v: &mut Vec<u8>, chunk: Chunk) {
    let mut data_bytes: Vec<u8> = Vec::new();

    encode_data(&mut data_bytes, chunk.get_data().clone());

    let message_length = if let Some(message_length) = chunk.get_message_header().get_message_length() {
        message_length
    } else {
        data_bytes.len() as u32
    };
    let splits = if message_length <= DEFAULT_CHUNK_SIZE {
        0
    } else {
        message_length / DEFAULT_CHUNK_SIZE + (message_length % DEFAULT_CHUNK != 0) as u32
    };

    if splits > 0 {
        let mut added: Vec<u8> = Vec::new();
        let basic_header = BasicHeader {
            message_header_format: 3,
            chunk_id: chunk.get_basic_header().get_chunk_id()
        };

        for i in 0..splits {
            if i > 0 {
                encode_basic_header(&mut added, basic_header);
            }

            let start = (DEFAULT_CHUNK_SIZE * i) as usize;
            let end = start + min(DEFAULT_CHUNK_SIZE, data_bytes[start..].len());

            added.extend_from_slice(&data_bytes[start..end]);
        }

        data_bytes = added;
    }

    encode_basic_header(v, chunk.get_basic_header());
    encode_message_header(
        v,
        MessageHeader {
            message_length,
            ..chunk.get_message_header()
        }
    );
    encode_extended_timestamp(v, chunk.get_extended_timestamp());
    v.append(&mut data_bytes);
}

fn send_connect_response(stream: &mut TcpStream, connect_command: ConnectCommand) -> IOResult<()> {
    /* 受信した connect コマンドを記憶する処理...? */

    /* connect コマンドの返送チャンクを作成・送信する処理 */
    // 基本的に受信チャンクのトランザクション ID をコピーする.
    let transaction_id = connect_command.get_received_transaction_id().unwrap();
    let mut properties: HashMap<String, AmfData> = HashMap::new();
    let mut information: HashMap<String, AmfData> = HashMap::new();

    properties.insert("fmsVer".to_string(), AmfData::String("FMS/3,0,1,123".to_string()));
    properties.insert("capabilities".to_string(), AmfData::Number(31 as f64));
    information.insert("level".to_string(), AmfData::String("status".to_string()));
    information.insert("code".to_string(), AmfData::String("NetConnection.Connect.Success".to_string()));
    information.insert("description".to_string(), AmfData::String("Connection succeeded.".to_string()));
    information.insert("objectEncoding".to_string(), AmfData::Number(0 as f64));

    let invoke = Chunk {
        basic_header: BasicHeader {
            message_header_format: 0,
            chunk_id: 3
        },
        message_header: MessageHeader {
            timestamp: Some(0),
            message_length: None,
            message_type: Some(20),
            message_id: Some(0)
        },
        extended_timestamp: None,
        data: Data::Invoke(
            // 構造が変更されたので追従する.
            InvokeCommand::NetConnection(
                NetConnectionCommand::Connect(
                    ConnectCommand::Response {
                        transaction_id,
                        properties,
                        information
                    }
                )
            )
        )
    };
    let mut invoke_bytes: Vec<u8> = Vec::new();
    let server_bandwidth = Chunk {
        basic_header: BasicHeader {
            message_header_format: 0,
            chunk_id: 2
        },
        message_header: MessageHeader {
            timestamp: Some(0),
            message_length: Some(4),
            message_type: Some(5),
            message_id: Some(0)
        },
        extended_timestamp: None,
        data: Data::ServerBandwidth(DEFAULT_BANDWIDTH)
    };
    let mut server_bandwidth_bytes: Vec<u8> = Vec::new();
    let client_bandwidth = Chunk {
        basic_header: BasicHeader {
            message_header_format: 0,
            chunk_id: 2
        },
        message_header: MessageHeader {
            timestamp: Some(0),
            message_length: Some(5),
            message_type: Some(6),
            message_id: Some(0)
        },
        extended_timestamp: None,
        data: Data::ClientBandwidth(DEFAULT_BANDWIDTH)
    };
    let mut client_bandwidth_bytes: Vec<u8> = Vec::new();
    let ping = Chunk {
        basic_header: BasicHeader {
            message_header_format: 0,
            chunk_id: 2
        },
        message_header: {
            timestamp: Some(0),
            message_length: Some(6),
            message_type: Some(4),
            message_id: Some(0)
        },
        extended_timestamp: None,
        data: Data::Ping(
            0,
            PingData::StreamBegin(0)
        )
    };
    let mut ping_bytes: Vec<u8> = Vec::new();
    let chunk_size = Chunk {
        basic_header: BasicHeader {
            message_header_format: 0,
            chunk_id: 2
        },
        message_header: MessageHeader {
            timestamp: Some(0),
            message_length: Some(4),
            message_type: Some(1),
            message_id: Some(0)
        },
        extended_timestamp: None,
        data: Data::ChunkSize(DEFAULT_CHUNK_SIZE)
    };
    let mut chunk_size_bytes: Vec<u8> = Vec::new();

    encode_chunk(&mut invoke_bytes, invoke);
    encode_chunk(&mut server_bandwidth_bytes, server_bandwidth);
    encode_chunk(&mut client_bandwidth_bytes, client_bandwidth);
    encode_chunk(&mut ping_bytes, ping);
    encode_chunk(&mut chunk_size_bytes, chunk_size);
    stream.write(invoke_bytes.as_slice())?;
    stream.write(server_bandwidth_bytes.as_slice())?;
    stream.write(client_bandwidth_bytes.as_slice())?;
    stream.write(ping_bytes.as_slice())?;
    stream.write(chunk_size.as_slice())?;
    stream.write(invoke_bytes.as_slice()).map(|_| ())
}

fn send_release_stream_response(stream: &mut TcpStream, release_stream_command: ReleaseStreamCommand) -> IOResult<()> {
    /* 受信した releaseStream コマンドを記憶する処理...? */

    /* releaseStream コマンドの返送チャンクを作成・送信する処理 */
    let transaction_id = release_stream_command.get_received_trnasaction_id().unwrap();
    let mut v: Vec<u8> = Vec::new();
    let invoke = Chunk {
        basic_header: BasicHeader {
            // 現時点ではまだ決定できない.
            message_header_format: ?,
            chunk_id: 3
        },
        message_header: MessageHeader {
            timestamp: Some(0),
            message_length: None,
            message_type: Some(20),
            message_id: Some(0)
        },
        extended_timestamp: None,
        data: Data::Invoke(
            InvokeCommand::NetConnection(
                NetConnectionCommand::ReleaseStream(
                    ReleaseStreamCommand::Response {
                        transaction_id
                    }
                )
            )
        )
    };

    encode_chunk(&mut v, invoke);
    stream.write(&mut stream, v.as_slice()).map(|_| ())
}

fn send_create_stream_response(stream: &mut TcpStream, create_stream_command: CreateStreamCommand, message_id: f64) -> IOResult<()> {
    /* 受信した createStream コマンドを記憶する処理...? */

    // 同上.
    let transaction_id = create_stream_command.get_received_transaction_id().unwrap();

    /* createStream コマンドの返送チャンクを作成・送信する処理 */
    let mut v: Vec<u8> = Vec::new();
    let invoke = Chunk {
        basic_header: BasicHeader {
            // 同上
            message_header_format: ?,
            chunk_id: 3
        },
        message_header: MessageHeader {
            timestamp: Some(0),
            message_length: None,
            message_type: Some(20),
            message_id: Some(0)
        },
        extended_timestamp: None,
        data: Data::Invoke(
            InvokeCommand::NetConnection(
                NetConnectionCommand::CreateStream(
                    CreateStreamCommand::Response {
                        transaction_id,
                        message_id
                    }
                )
            )
        )
    };

    encode_chunk(&mut v, invoke);
    stream.write(v.as_slice()).map(|_| ())
}

fn send_net_connection_response(stream: &mut TcpStream, net_connection_command: NetConnectionCommand) -> IOResult<()> {
    match net_connection_command {
        NetConnectionCommand::Connect(connect_command) => send_connect_response(stream, connect_command),
        NetConnectionCommand::ReleaseStream(release_stream_command) => send_release_stream_response(stream, release_stream_command),
        NetConnectionCommand::CreateStream(create_stream_command) => send_create_stream_command(stream, create_stream_command)
    }
}

fn send_fc_publish_response(stream: &mut TcpStream, fc_publish_command: FCPublishCommand) -> IOResult<()> {
    /* 受信した FCPublish コマンドを記憶する処理...? */

    /* FCPublish コマンドの返送チャンクを作成・送信する処理 */
    let transaction_id = fc_publish_command.get_received_transaction_id().unwrap();
    let mut v: Vec<u8> = Vec::new();
    let invoke = Chunk {
        basic_header: BasicHeader {
            // 同上
            message_header_format: ?,
            chunk_id: 3
        },
        message_header: MessageHeader {
            timestamp: Some(0),
            message_length: None,
            message_type: Some(20),
            message_id: Some(0)
        },
        extended_timestamp: None,
        data: Data::Invoke(
            InvokeCommand::FCPublish(
                FCPublishCommand::Response
            )
        )
    };

    encode_chunk(&mut v, invoke);
    stream.write(v.as_slice()).map(|_| ())
}

fn send_invoke_response(stream: &mut TcpStream, invoke_command: InvokeCommand) -> IOResult<()> {
    match invoke_command {
        InvokeCommand::NetConnection(net_connection_command) => send_net_connection_response(stream, net_connection_command),
        InvokeCommand::FCPublish(fc_publish_command) => send_fc_publish_response(stream, fc_publish)
    }
}

fn main() -> IOResult<()> {
    let listener = TcpListener::bind("127.0.0.1:1935")?;

    for incoming in listener.incoming() {
        let mut stream = incoming?;
        /* ハンドシェイクは完了しているとみなす. */
        let received_chunk = receive_chunk(&mut stream)?;

        match received_chunk.get_data().clone() {
            Data::Invoke(invoke_command) => send_invoke_response(&mut stream, invoke_command)?,
            // 今のところ, Invoke チャンクの処理のみを考える.
            _ => {}
        }
    }

    Ok(())
}
```

これで releaseStream, FCPublish および createStream チャンクそれぞれの受信と各応答チャンクの送信自体は実装した.

#### 直前のチャンクの情報の保存

上記から更に以下の点を考慮する:

1. 送受信したチャンクの内容を記憶する方法
2. 送信するチャンクメッセージヘッダの形式を決定する方法
3. 直前のチャンクからチャンクメッセージヘッダを参照する方法

##### 受信チャンクの場合

まず, 受信チャンクの場合の例を以下に記す. 上記の例ではコメントを残したのみではあるが, 当該箇所から受信したすべてのチャンクに対して同様に行う必要があることが予想できる. つまり, チャンクデータの種類を問わず受信時にまとめて行う必要がある. それは `receive_chunk` の実装を以下のように追記することで行うことができる.

```rust
use std::{
    collections::{
        HashMap
    },
    io::{
        Result as IOResult
    },
    net::{
        TcpStream
    }
};

#[derive(Clone, Copy)]
struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

impl BasicHeader {
    fn get_message_header_format(&self) -> u8 {
        self.message_header_format
    }

    fn get_chunk_id(&self) -> u16 {
        self.chunk_id
    }
}

#[derive(Clone, Copy)]
struct MessageHeader {
    timestamp: Option<u32>,
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

impl MessageHeader {
    fn get_timestamp(&self) -> Option<u32> {
        self.timestamp
    }

    fn set_timestamp(&mut self, timestamp: u32) {
        self.timestamp = Some(timestamp);
    }

    fn get_message_length(&self) -> Option<u32> {
        self.message_length
    }

    fn set_message_length(&mut self, message_length: u32) {
        self.message_length = Some(message_length);
    }

    fn get_message_type(&self) -> Option<u8> {
        self.message_type
    }

    fn set_message_type(&mut self, message_type: u8) {
        self.message_type = Some(message_type);
    }

    fn get_message_id(&self) -> Option<u32> {
        self.mmessage_id
    }

    fn set_message_id(&mut self, message_id: u32) {
        self.message_id = Some(message_id);
    }
}

struct Chunk {
    basic_header: BasicHeader,
    message_header: MessageHeader,
    extended_timestamp: Option<u32>,
    data: Data
}

impl Chunk {
    fn get_basic_header(&self) -> BasicHeader {
        self.basic_header
    }

    fn get_message_header(&self) -> MessageHeader {
        self.message_header
    }

    fn get_extended_timestamp(&self) -> Option<u32> {
        self.extended_timestamp
    }

    fn get_data(&self) -> &Data {
        &self.data
    }
}

fn receive_chunk(stream: &mut TcpStream, last_received_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<Chunk> {
    let basic_header = receive_basic_header(stream)?;
    let chunk_id = basic_header.get_chunk_id();
    let mut last_message_header = if let Some (ref mut last_message_header) = last_received_chunks.get_mut(&chunk_id) {
        *last_message_header
    } else {
        MessageHeader {
            timestamp: None,
            message_length: None,
            message_type: None,
            message_id: None
        }
    };
    let received_message_header = receive_message_header(stream, basic_header.get_message_header_format())?;
    let timestamp = if let Some(timestamp) = received_message_header.get_timestamp() {
        timestamp
    } else {
        // 仕様上, 受信チャンクにない時は記憶済みの直前のチャンクメッセージヘッダから参照できると考えて良い.
        last_message_header.get_timestamp().unwrap()
    };
    let message_length = if let Some(message_length) = received_message_header.get_message_length() {
        message_length
    } else {
        // 同上.
        last_message_header.unwrap().get_message_length().unwrap()
    };
    let message_type = if let Some(message_type) = received_message_header.get_message_type() {
        message_type
    } else {
        // 同上.
        last_message_header.get_message_type().unwrap()
    };
    let message_id = if let Some(message_id) = received_message_header.get_message_id() {
        message_id
    } else {
        // 同上.
        last_message_header.get_message_id().unwrap()
    };
    let extended_timestamp = receive_extended_timestamp(stream, timestamp)?;
    let data = receive_data(stream, message_type, message_length)?;

    last_message_header.set_timestamp(timestamp);
    last_message_header.set_message_length(message_length);
    last_message_header.set_message_type(message_type);
    last_message_header.set_message_id(message_id);
    last_received_chunks.insert(chunk_id, last_message_header);

    Ok(
        Chunk {
            basic_header,
            message_header,
            extended_timestamp,
            data
        }
    )
}
```

##### 送信チャンクの場合

次に, 送信チャンクの場合の例を以下に記す.

```rust
use std::{
    collections::{
        HashMap
    },
    io::{
        Result as IOResult,
        Write
    },
    net::{
        TcpStream
    }
};

#[derive(Clone, Copy)]
struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

impl BasicHeader {
    fn get_message_header_format(&self) -> u8 {
        self.message_header_format
    }

    fn get_chunk_id(&self) -> u16 {
        self.chunk_id
    }
}

#[derive(Clone, Copy)]
struct MessageHeader {
    timestamp: Option<u32>,
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

impl MessageHeader {
    fn get_timestamp(&self) -> Option<u32> {
        self.timestamp
    }

    fn set_timestamp(&mut self, timestamp: u32) {
        self.timestamp = Some(timestamp);
    }

    fn get_message_length(&self) -> Option<u32> {
        self.message_length
    }

    fn set_message_length(&mut self, message_length: u32) {
        self.message_length = Some(message_length);
    }

    fn get_message_type(&self) -> Option<u8> {
        self.message_type
    }

    fn set_message_type(&mut self, message_type: u8) {
        self.message_type = Some(message_type);
    }

    fn get_message_id(&self) -> Option<u32> {
        self.mmessage_id
    }

    fn set_message_id(&mut self, message_id: u32) {
        self.message_id = Some(message_id);
    }
}

#[derive(Clone, Copy)]
enum PingData {
    StreamBegin(u32)
}

#[derive(Clone)]
enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Null,
    Unknown
}

#[derive(Clone)]
enum ConnectCommand {
    Request {
        transaction_id: f64,
        command_object: HashMap<String, AmfData>
    },
    Response {
        transaction_id: f64,
        properties: HashMap<String, AmfData>,
        information: HashMap<String, AmfData>
    }
}

#[derive(Clone)]
enum ReleaseStreamCommand {
    Request {
        transaction_id: f64,
        playpath: String
    },
    Response {
        transaction_id: f64
    }
}

impl ReleaseStreamCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            ReleaseStreamCommand::Request {
                transaction_id,
                play_path: _
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum CreateStreamCommand {
    Request {
        transaction_id: f64
    },
    Response {
        transaction_id: f64,
        message_id: f64
    }
}

impl CreateStreamCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            CreateStreamCommand::Request {
                transaction_id
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum NetConnectionCommand {
    Connect(ConnectCommand),
    ReleaseStream(ReleaseStreamCommand),
    CreateStream(CreateStreamCommand)
}

#[derive(Clone)]
enum FCPublishCommand {
    Request {
        transaction_id: f64,
        playpath: String
    },
    Response
}

impl FCPublishCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            FCPublishCommand::Request {
                transaction_id,
                playpath: _
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum InvokeCommand {
    NetConnection(NetConnectionCommand),
    FCPublish(FCPublishCommand)
}

#[derive(Clone)]
enum Data {
    ChunkSize(u32),
    Ping(u16, PingData),
    ServerBandwidth(u32),
    ClientBandwidth(u32, u8),
    Invoke(InvokeCommand),
    Unknown(Vec<u8>)
}

struct Chunk {
    basic_header: BasicHeader,
    message_header: MessageHeader,
    extended_timestamp: Option<u32>,
    data: Data
}

impl Chunk {
    fn get_basic_header(&self) -> BasicHeader {
        self.basic_header
    }

    fn get_message_header(&self) -> MessageHeader {
        self.message_header
    }

    fn get_extended_timestamp(&self) -> Option<u32> {
        self.extended_timestamp
    }

    fn get_data(&self) -> &Data {
        &self.data
    }
}

fn send_chunk(stream: &mut TcpStream, chunk_id: u16, mut timestamp: u32, message_length: u32, message_type: u8, message_id: u32, data: Data, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let mut last_message_header = if let Some(ref mut last_message_header) = last_sent_chunks.get_mut(&chunk_id) {
        *last_message_header
    } else {
        MessageHeader {
            timestamp: None,
            message_length: None,
            message_type: None,
            message_id: None
        }
    };
    let last_timestamp = last_message_header.get_timestamp().unwrap_or_default();
    let last_message_length = last_message_header.get_message_length().unwrap_or_default();
    let last_message_type = last_message_header.get_message_type().unwrap_or_default();
    let last_message_id = last_message_header.get_message_id().unwrap_or_default();
    let message_header_format: u8 = if message_id == last_message_id {
        // メッセージストリーム ID のみ同じ場合は形式 1 である.
        if message_length == last_message_length && message_type == last_message_type {
            // メッセージストリーム ID に加えて, メッセージ長とメッセージの種類が同じ場合は形式 2 である.
            if timestamp == last_timestamp {
                // すべて同じ場合は形式 3 である.
                3
            } else {
                2
            }
        } else {
            1
        }
    } else {
        // メッセージ ID が違う場合は, 他のどのフィールドが同じでも形式 0 である.
        0
    };
    let basic_header = BasicHeader {
        message_header_format,
        chunk_id
    };
    let extended_timestamp = if timestamp >= 0x00ffffff as u32 {
        let extended_timestamp = Some(timestamp);

        timestamp = 0x00ffffff;
        extended_timestamp
    } else {
        None
    };
    let message_header = match message_header_format {
        0 => MessageHeader {
            timestamp,
            message_length,
            message_type,
            message_id
        },
        1 => MessageHeader {
            timestamp,
            message_length,
            message_type,
            message_id: None
        },
        2 => MessageHeader {
            timestamp,
            message_length: None,
            message_type: None,
            message_id: None
        },
        3 => MessageHeader {
            timestamp: None,
            message_length: None,
            message_type: None,
            message_id: None
        },
        // 0 から 3 の間にない数値であった場合は強制的にプログラムを落とす. (必要な時は来ないとは思うが)
        n => panic!("what's this!?: {}", n)
    };
    let chunk = Chunk {
        basic_header,
        message_header,
        extended_timestamp,
        data
    };
    let mut v: Vec<u8> = Vec::new();

    encode_chunk(&mut v, chunk);
    stream.write(v.as_slice()).map(|_| ())
}
```

ここで, 各送信チャンクも同様に上記の手順を実行できるように, チャンクデータの種類別に送信関数を用意し, それらに `send_chunk` を呼ばせるようにする.

```rust
use std::{
    collections::{
        HashMap
    },
    io::{
        Result as IOResult,
        Write
    },
    net::{
        TcpStream
    }
};

const DEFAULT_CHUNK_SIZE: u32 = 128;
const DEFAULT_BANDWIDTH: u32 = 3000000;

#[derive(Clone, Copy)]
struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

impl BasicHeader {
    fn get_message_header_format(&self) -> u8 {
        self.message_header_format
    }

    fn get_chunk_id(&self) -> u16 {
        self.chunk_id
    }
}

#[derive(Clone, Copy)]
struct MessageHeader {
    timestamp: Option<u32>,
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

impl MessageHeader {
    fn get_timestamp(&self) -> Option<u32> {
        self.timestamp
    }

    fn set_timestamp(&mut self, timestamp: u32) {
        self.timestamp = Some(timestamp);
    }

    fn get_message_length(&self) -> Option<u32> {
        self.message_length
    }

    fn set_message_length(&mut self, message_length: u32) {
        self.message_length = Some(message_length);
    }

    fn get_message_type(&self) -> Option<u8> {
        self.message_type
    }

    fn set_message_type(&mut self, message_type: u8) {
        self.message_type = Some(message_type);
    }

    fn get_message_id(&self) -> Option<u32> {
        self.mmessage_id
    }

    fn set_message_id(&mut self, message_id: u32) {
        self.message_id = Some(message_id);
    }
}

#[derive(Clone, Copy)]
enum PingData {
    StreamBegin(u32)
}

#[derive(Clone)]
enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Null,
    Unknown
}

#[derive(Clone)]
enum ConnectCommand {
    Request {
        transaction_id: f64,
        command_object: HashMap<String, AmfData>
    },
    Response {
        transaction_id: f64,
        properties: HashMap<String, AmfData>,
        information: HashMap<String, AmfData>
    }
}

#[derive(Clone)]
enum ReleaseStreamCommand {
    Request {
        transaction_id: f64,
        playpath: String
    },
    Response {
        transaction_id: f64
    }
}

impl ReleaseStreamCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            ReleaseStreamCommand::Request {
                transaction_id,
                play_path: _
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum CreateStreamCommand {
    Request {
        transaction_id: f64
    },
    Response {
        transaction_id: f64,
        message_id: f64
    }
}

impl CreateStreamCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            CreateStreamCommand::Request {
                transaction_id
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum NetConnectionCommand {
    Connect(ConnectCommand),
    ReleaseStream(ReleaseStreamCommand),
    CreateStream(CreateStreamCommand)
}

#[derive(Clone)]
enum FCPublishCommand {
    Request {
        transaction_id: f64,
        playpath: String
    },
    Response
}

impl FCPublishCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            FCPublishCommand::Request {
                transaction_id,
                playpath: _
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum InvokeCommand {
    NetConnection(NetConnectionCommand),
    FCPublish(FCPublishCommand)
}

#[derive(Clone)]
enum Data {
    ChunkSize(u32),
    Ping(u16, PingData),
    ServerBandwidth(u32),
    ClientBandwidth(u32, u8),
    Invoke(InvokeCommand),
    Unknown(Vec<u8>)
}

struct Chunk {
    basic_header: BasicHeader,
    message_header: MessageHeader,
    extended_timestamp: Option<u32>,
    data: Data
}

impl Chunk {
    fn get_basic_header(&self) -> BasicHeader {
        self.basic_header
    }

    fn get_message_header(&self) -> MessageHeader {
        self.message_header
    }

    fn get_extended_timestamp(&self) -> Option<u32> {
        self.extended_timestamp
    }

    fn get_data(&self) -> &Data {
        &self.data
    }
}

fn send_chunk(stream: &mut TcpStream, chunk_id: u16, mut timestamp: u32, message_length: u32, message_type: u8, message_id: u32, data: Data, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let mut last_message_header = if let Some(ref mut last_message_header) = last_sent_chunks.get_mut(&chunk_id) {
        *last_message_header
    } else {
        MessageHeader {
            timestamp: None,
            message_length: None,
            message_type: None,
            message_id: None
        }
    };
    let last_timestamp = last_message_header.get_timestamp().unwrap_or_default();
    let last_message_length = last_message_header.get_message_length().unwrap_or_default();
    let last_message_type = last_message_header.get_message_type().unwrap_or_default();
    let last_message_id = last_message_header.get_message_id().unwrap_or_default();
    let message_header_format: u8 = if message_id == last_message_id {
        if message_length == last_message_length && message_type == last_message_type {
            if timestamp == last_timestamp {
                3
            } else {
                2
            }
        } else {
            1
        }
    } else {
        0
    };
    let basic_header = BasicHeader {
        message_header_format,
        chunk_id
    };
    let extended_timestamp = if timestamp >= 0x00ffffff as u32 {
        let extended_timestamp = Some(timestamp);

        timestamp = 0x00ffffff;
        extended_timestamp
    } else {
        None
    };
    let message_header = match message_header_format {
        0 => MessageHeader {
            timestamp,
            message_length,
            message_type,
            message_id
        },
        1 => MessageHeader {
            timestamp,
            message_length,
            message_type,
            message_id: None
        },
        2 => MessageHeader {
            timestamp,
            message_length: None,
            message_type: None,
            message_id: None
        },
        3 => MessageHeader {
            timestamp: None,
            message_length: None,
            message_type: None,
            message_id: None
        },
        n => panic!("what's this!?: {}", n)
    };
    let chunk = Chunk {
        basic_header,
        message_header,
        extended_timestamp,
        data
    };
    let mut v: Vec<u8> = Vec::new();

    encode_chunk(&mut v, chunk);
    stream.write(v.as_slice()).map(|_| ())
}

/* 送信時のタイムスタンプやメッセージストリーム ID の実際の渡し方については後述する. */

fn send_chunk_size(stream: &mut TcpStream, chunk_size: u32, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    // 仕様の範囲内であるかをチェック.
    if chunk_size < 1 || chunk_size > 0x7fffffff {
        return Err(ErrorKind::InvalidData.into());
    }

    send_chunk(stream, 2, 0, 4, 1, 0, Data::ChunkSize(chunk_size), last_sent_chunks)
}

fn send_stream_begin(stream: &mut TcpStream, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    send_chunk(stream, 2, 0, 6, 4, 0, Data::Ping(1, PingData::StreamBegin(0)), last_sent_chunks)
}

fn send_ping(stream: &mut TcpStream, ping_type: u16, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    match ping_type {
        1 => send_stream_begin(stream, last_sent_chunks),
        n => panic!("what's this!?: {}", n)
    }
}

fn send_server_bandwidth(stream: &mut TcpStream, server_bandwidth: u32, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    send_chunk(2, 0, 4, 5, 0, Data::ServerBandwidth(server_bandwidth), last_sent_chunks)
}

fn send_client_bandwidth(stream: &mut TcpStream, client_bandwidth: u32, limit: u8, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    send_chunk(2, 0, 5, 6, 0, Data::ClientBandwidth(client_bandwidth, limit), last_sent_chunks)
}

fn send_invoke(stream: &mut TcpStream, invoke_command: InvokeCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let mut v: Vec<u8> = Vec::new();

    encode_data(&mut v, Data::Invoke(invoke_command.clone()));
    send_chunk(3, 0, v.len(), 20, 0, Data::Invoke(invoke_command), last_sent_chunks)
}
```

次に, 既存の関数内に書かれてある `stream.write()` を上記の関数に置き換えていく.

```rust
use std::{
    collections::{
        HashMap
    },
    io::{
        Result as IOResult,
        Write
    },
    net::{
        TcpStream
    }
};

const DEFAULT_CHUNK_SIZE: u32 = 128;
const DEFAULT_BANDWIDTH: u32 = 3000000;

#[derive(Clone, Copy)]
struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

impl BasicHeader {
    fn get_message_header_format(&self) -> u8 {
        self.message_header_format
    }

    fn get_chunk_id(&self) -> u16 {
        self.chunk_id
    }
}

#[derive(Clone, Copy)]
struct MessageHeader {
    timestamp: Option<u32>,
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

impl MessageHeader {
    fn get_timestamp(&self) -> Option<u32> {
        self.timestamp
    }

    fn set_timestamp(&mut self, timestamp: u32) {
        self.timestamp = Some(timestamp);
    }

    fn get_message_length(&self) -> Option<u32> {
        self.message_length
    }

    fn set_message_length(&mut self, message_length: u32) {
        self.message_length = Some(message_length);
    }

    fn get_message_type(&self) -> Option<u8> {
        self.message_type
    }

    fn set_message_type(&mut self, message_type: u8) {
        self.message_type = Some(message_type);
    }

    fn get_message_id(&self) -> Option<u32> {
        self.mmessage_id
    }

    fn set_message_id(&mut self, message_id: u32) {
        self.message_id = Some(message_id);
    }
}

#[derive(Clone, Copy)]
enum PingData {
    StreamBegin(u32)
}

#[derive(Clone)]
enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Null,
    Unknown
}

#[derive(Clone)]
enum ConnectCommand {
    Request {
        transaction_id: f64,
        command_object: HashMap<String, AmfData>
    },
    Response {
        transaction_id: f64,
        properties: HashMap<String, AmfData>,
        information: HashMap<String, AmfData>
    }
}

#[derive(Clone)]
enum ReleaseStreamCommand {
    Request {
        transaction_id: f64,
        playpath: String
    },
    Response {
        transaction_id: f64
    }
}

impl ReleaseStreamCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            ReleaseStreamCommand::Request {
                transaction_id,
                play_path: _
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum CreateStreamCommand {
    Request {
        transaction_id: f64
    },
    Response {
        transaction_id: f64,
        message_id: f64
    }
}

impl CreateStreamCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            CreateStreamCommand::Request {
                transaction_id
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum NetConnectionCommand {
    Connect(ConnectCommand),
    ReleaseStream(ReleaseStreamCommand),
    CreateStream(CreateStreamCommand)
}

#[derive(Clone)]
enum FCPublishCommand {
    Request {
        transaction_id: f64,
        playpath: String
    },
    Response
}

impl FCPublishCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            FCPublishCommand::Request {
                transaction_id,
                playpath: _
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum InvokeCommand {
    NetConnection(NetConnectionCommand),
    FCPublish(FCPublishCommand)
}

#[derive(Clone)]
enum Data {
    ChunkSize(u32),
    Ping(u16, PingData),
    ServerBandwidth(u32),
    ClientBandwidth(u32, u8),
    Invoke(InvokeCommand),
    Unknown(Vec<u8>)
}

struct Chunk {
    basic_header: BasicHeader,
    message_header: MessageHeader,
    extended_timestamp: Option<u32>,
    data: Data
}

impl Chunk {
    fn get_basic_header(&self) -> BasicHeader {
        self.basic_header
    }

    fn get_message_header(&self) -> MessageHeader {
        self.message_header
    }

    fn get_extended_timestamp(&self) -> Option<u32> {
        self.extended_timestamp
    }

    fn get_data(&self) -> &Data {
        &self.data
    }
}

fn send_chunk(stream: &mut TcpStream, chunk_id: u16, mut timestamp: u32, message_length: u32, message_type: u8, message_id: u32, data: Data, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let mut last_message_header = if let Some(ref mut last_message_header) = last_sent_chunks.get_mut(&chunk_id) {
        *last_message_header
    } else {
        MessageHeader {
            timestamp: None,
            message_length: None,
            message_type: None,
            message_id: None
        }
    };
    let last_timestamp = last_message_header.get_timestamp().unwrap_or_default();
    let last_message_length = last_message_header.get_message_length().unwrap_or_default();
    let last_message_type = last_message_header.get_message_type().unwrap_or_default();
    let last_message_id = last_message_header.get_message_id().unwrap_or_default();
    let message_header_format: u8 = if message_id == last_message_id {
        if message_length == last_message_length && message_type == last_message_type {
            if timestamp == last_timestamp {
                3
            } else {
                2
            }
        } else {
            1
        }
    } else {
        0
    };
    let basic_header = BasicHeader {
        message_header_format,
        chunk_id
    };
    let extended_timestamp = if timestamp >= 0x00ffffff as u32 {
        let extended_timestamp = Some(timestamp);

        timestamp = 0x00ffffff;
        extended_timestamp
    } else {
        None
    };
    let message_header = match message_header_format {
        0 => MessageHeader {
            timestamp,
            message_length,
            message_type,
            message_id
        },
        1 => MessageHeader {
            timestamp,
            message_length,
            message_type,
            message_id: None
        },
        2 => MessageHeader {
            timestamp,
            message_length: None,
            message_type: None,
            message_id: None
        },
        3 => MessageHeader {
            timestamp: None,
            message_length: None,
            message_type: None,
            message_id: None
        },
        n => panic!("what's this!?: {}", n)
    };
    let chunk = Chunk {
        basic_header,
        message_header,
        extended_timestamp,
        data
    };
    let mut v: Vec<u8> = Vec::new();

    encode_chunk(&mut v, chunk);
    stream.write(v.as_slice()).map(|_| ())
}

/* 送信時のタイムスタンプやメッセージストリーム ID の実際の渡し方については後述する. */

fn send_chunk_size(stream: &mut TcpStream, chunk_size: u32, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    if chunk_size < 1 || chunk_size > 0x7fffffff {
        return Err(ErrorKind::InvalidData.into());
    }

    send_chunk(stream, 2, 0, 4, 1, 0, Data::ChunkSize(chunk_size), last_sent_chunks)
}

fn send_stream_begin(stream: &mut TcpStream, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    send_chunk(stream, 2, 0, 6, 4, 0, Data::Ping(1, PingData::StreamBegin(0)), last_sent_chunks)
}

fn send_ping(stream: &mut TcpStream, ping_type: u16, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    match ping_type {
        1 => send_stream_begin(stream, last_sent_chunks),
        n => panic!("what's this!?: {}", n)
    }
}

fn send_server_bandwidth(stream: &mut TcpStream, server_bandwidth: u32, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    send_chunk(2, 0, 4, 5, 0, Data::ServerBandwidth(server_bandwidth), last_sent_chunks)
}

fn send_client_bandwidth(stream: &mut TcpStream, client_bandwidth: u32, limit: u8, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    send_chunk(2, 0, 5, 6, 0, Data::ClientBandwidth(client_bandwidth, limit), last_sent_chunks)
}

fn send_invoke(stream: &mut TcpStream, invoke_command: InvokeCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let mut v: Vec<u8> = Vec::new();

    encode_data(&mut v, Data::Invoke(invoke_command.clone()));
    send_chunk(3, 0, v.len(), 20, 0, Data::Invoke(invoke_command), last_sent_chunks)
}

fn send_connect_response(stream: &mut TcpStream, connect_command: ConnectCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader) -> IOResult<()> {
    // 基本的に受信チャンクのトランザクション ID をコピーする.
    let transaction_id = connect_command.get_received_transaction_id().unwrap();
    let mut properties: HashMap<String, AmfData> = HashMap::new();
    let mut information: HashMap<String, AmfData> = HashMap::new();

    properties.insert("fmsVer".to_string(), AmfData::String("FMS/3,0,1,123".to_string()));
    properties.insert("capabilities".to_string(), AmfData::Number(31 as f64));
    information.insert("level".to_string(), AmfData::String("status".to_string()));
    information.insert("code".to_string(), AmfData::String("NetConnection.Connect.Success".to_string()));
    information.insert("description".to_string(), AmfData::String("Connection succeeded.".to_string()));
    information.insert("objectEncoding".to_string(), AmfData::Number(0 as f64));

    let invoke = Data::Invoke(
        InvokeCommand::NetConnection(
            NetConnectionCommand::Connect(
                ConnectCommand::Response {
                    transaction_id,
                    properties,
                    information
                }
            )
        )
    );

    send_invoke(stream, invoke.clone(), last_sent_chunks)?;
    send_server_bandwidth(stream, DEFAULT_BANDWIDTH, last_sent_chunks)?;
    send_client_bandwidth(stream, DEFAULT_BANDWIDTH, last_sent_chunks)?;
    send_ping(stream, 1, last_sent_chunks)?;
    send_chunk_size(stream, DEFAULT_CHUNK_SIZE, last_sent_chunks)?;
    send_invoke(stream, invoke, last_sent_chunks)
}

fn send_release_stream_response(stream: &mut TcpStream, release_stream_command: ReleaseStreamCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    // 同上.
    let transaction_id = release_stream_command.get_received_trnasaction_id().unwrap();
    let invoke = Data::Invoke(
        InvokeCommand::NetConnection(
            NetConnectionCommand::ReleaseStream(
                ReleaseStreamCommand::Response {
                    transaction_id
                }
            )
        )
    );

    send_invoke(stream, invoke, last_sent_chunks)
}

fn send_create_stream_response(stream: &mut TcpStream, create_stream_command: CreateStreamCommand, message_id: f64, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    // 同上.
    let transaction_id = create_stream_command.get_received_transaction_id().unwrap();
    let invoke = Data::Invoke(
        InvokeCommand::NetConnection(
            NetConnectionCommand::CreateStream(
                CreateStreamCommand::Response {
                    transaction_id,
                    message_id
                }
            )
        )
    );

    send_invoke(stream, invoke, last_sent_chunks)
}

fn send_net_connection_response(stream: &mut TcpStream, net_connection_command: NetConnectionCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    match net_connection_command {
        NetConnectionCommand::Connect(connect_command) => send_connect_response(stream, connect_command, last_sent_chunks),
        NetConnectionCommand::ReleaseStream(release_stream_command) => send_release_stream_response(stream, release_stream_command, last_sent_chunks),
        NetConnectionCommand::CreateStream(create_stream_command) => send_create_stream_command(stream, create_stream_command, last_sent_chunks)
    }
}

fn send_fc_publish_response(stream: &mut TcpStream, fc_publish_command: FCPublishCommand) -> IOResult<()> {
    // 同上.
    let transaction_id = fc_publish_command.get_received_transaction_id().unwrap();
    let invoke = Data::Invoke(
        InvokeCommand::FCPublish(
            FCPublishCommand::Response
        )
    );

    send_invoke(stream, invoke, last_sent_chunks)
}

fn send_invoke_response(stream: &mut TcpStream, invoke_command: InvokeCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    match invoke_command {
        InvokeCommand::NetConnection(net_connection_command) => send_net_connection_response(stream, net_connection_command, last_sent_chunks),
        InvokeCommand::FCPublish(fc_publish_command) => send_fc_publish_response(stream, fc_publish, last_sent_chunks)
    }
}
```

そして, 上記のコードを `main` および `receive_chunk` と合流させる. また, `decode_invoke` の変更を忘れていたため, 下記のコードにてそれも行う.

```rust
use std::{
    collections::{
        HashMap
    },
    io::{
        Error as IOError,
        ErrorKind,
        Read,
        Result as IOResult,
        Write
    },
    net::{
        TcpListener,
        TcpStream
    }
};

const DEFAULT_CHUNK_SIZE: u32 = 128;
const DEFAULT_BANDWIDTH: u32 = 3000000;

#[derive(Clone, Copy)]
struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

impl BasicHeader {
    fn get_message_header_format(&self) -> u8 {
        self.message_header_format
    }

    fn get_chunk_id(&self) -> u16 {
        self.chunk_id
    }
}

#[derive(Clone, Copy)]
struct MessageHeader {
    timestamp: Option<u32>,
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

impl MessageHeader {
    fn get_timestamp(&self) -> Option<u32> {
        self.timestamp
    }

    fn set_timestamp(&mut self, timestamp: u32) {
        self.timestamp = Some(timestamp);
    }

    fn get_message_length(&self) -> Option<u32> {
        self.message_length
    }

    fn set_message_length(&mut self, message_length: u32) {
        self.message_length = Some(message_length);
    }

    fn get_message_type(&self) -> Option<u8> {
        self.message_type
    }

    fn set_message_type(&mut self, message_type: u8) {
        self.message_type = Some(message_type);
    }

    fn get_message_id(&self) -> Option<u32> {
        self.mmessage_id
    }

    fn set_message_id(&mut self, message_id: u32) {
        self.message_id = Some(message_id);
    }
}

#[derive(Clone, Copy)]
enum PingData {
    StreamBegin(u32)
}

#[derive(Clone)]
enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Null,
    Unknown
}

impl AmfData {
    fn number(self) -> Option<f64> {
        match self {
            AmfData::Number(number) => Some(number),
            _ => None
        }
    }

    fn boolean(self) -> Option<bool> {
        match self {
            AmfData::Boolean(boolean) => Some(boolean),
            _ => None
        }
    }

    fn string(self) -> Option<String> {
        match self {
            AmfData::String(string) => Some(string),
            _ => None
        }
    }

    fn object(self) -> Option<HashMap<String, AmfData>> {
        match self {
            AmfData::Object(object) => Some(object),
            _ => None
        } 
    }
}

#[derive(Clone)]
enum ConnectCommand {
    Request {
        transaction_id: f64,
        command_object: HashMap<String, AmfData>
    },
    Response {
        transaction_id: f64,
        properties: HashMap<String, AmfData>,
        information: HashMap<String, AmfData>
    }
}

#[derive(Clone)]
enum ReleaseStreamCommand {
    Request {
        transaction_id: f64,
        playpath: String
    },
    Response {
        transaction_id: f64
    }
}

impl ReleaseStreamCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            ReleaseStreamCommand::Request {
                transaction_id,
                play_path: _
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum CreateStreamCommand {
    Request {
        transaction_id: f64
    },
    Response {
        transaction_id: f64,
        message_id: f64
    }
}

impl CreateStreamCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            CreateStreamCommand::Request {
                transaction_id
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum NetConnectionCommand {
    Connect(ConnectCommand),
    ReleaseStream(ReleaseStreamCommand),
    CreateStream(CreateStreamCommand)
}

#[derive(Clone)]
enum FCPublishCommand {
    Request {
        transaction_id: f64,
        playpath: String
    },
    Response
}

impl FCPublishCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            FCPublishCommand::Request {
                transaction_id,
                playpath: _
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum InvokeCommand {
    NetConnection(NetConnectionCommand),
    FCPublish(FCPublishCommand)
}

#[derive(Clone)]
enum Data {
    ChunkSize(u32),
    Ping(u16, PingData),
    ServerBandwidth(u32),
    ClientBandwidth(u32, u8),
    Invoke(InvokeCommand),
    Unknown(Vec<u8>)
}

struct Chunk {
    basic_header: BasicHeader,
    message_header: MessageHeader,
    extended_timestamp: Option<u32>,
    data: Data
}

impl Chunk {
    fn get_basic_header(&self) -> BasicHeader {
        self.basic_header
    }

    fn get_message_header(&self) -> MessageHeader {
        self.message_header
    }

    fn get_extended_timestamp(&self) -> Option<u32> {
        self.extended_timestamp
    }

    fn get_data(&self) -> &Data {
        &self.data
    }
}

fn decode_amf_number(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let mut number_bytes: [u8; 8] = [0; 8];

    number_bytes.copy_from_slice(&data[*offset..(*offset + 8)]);
    *offset += 8;

    let number = f64::from_bits(u64::from_be_bytes(number_bytes));

    Ok(AmfData::Number(number))
}

fn decode_amf_boolean(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let boolean = data[*offset] > 0;

    *offset += 1;
    Ok(AmfData::Boolean(boolean))
}

fn decode_amf_string(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let mut length_bytes: [u8; 2] = [0; 2];

    length_bytes.copy_from_slice(&data[*offset..(*offset + 2)]);
    *offset += 2;

    let string = String::from_utf8(data[*offset..(*offset + length)].to_vec()).map_err(
        |_| IOError::from(ErrorKind::InvalidData)
    )?;

    *offset += length;
    Ok(AmfData::String(string))
}

fn decode_amf_object(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let mut object: HashMap<String, AmfData> = HashMap::new();

    while &data[*offset..(*offset + 3)] != &[0, 0, 9] {
        let name = decode_amf_string(data, offset)?.string().unwrap();
        let value = decode_amf_data(data, offset)?;

        object.insert(name, value);
    }

    Ok(AmfData::Object(object))
}

fn decode_amf_null(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    Ok(AmfData::Null)
}

fn decode_amf_unknown(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    /* 当該部分の実装は後述する. */
    Ok(AmfData::Unknown)
}

fn decode_amf_data(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    match data[*offset] {
        0 => {
            *offset += 1;
            decode_amf_number(data, offset)
        },
        1 => {
            *offset += 1;
            decode_amf_boolean(data, offset)
        },
        2 => {
            *offset += 1;
            decode_amf_string(data, offset)
        },
        3 => {
            *offset += 1;
            decode_amf_object(data, offset)
        },
        5 => {
            *offset += 1;
            decode_amf_null(data, offset)
        },
        _ => {
            *offset += 1;
            decode_amf_unknown()
        }
    }
}

fn receive_basic_header(stream: &mut TcpStream) -> IOResult<BasicHeader> {
    let mut first_byte: [u8; 1] = [0; 1];

    stream.read(&mut first_byte)?;

    let message_header_format = (first_byte[0] & 0xc0) >> 6;
    let chunk_id = match first_byte[0] & 0x3f {
        0 => {
            let mut chunk_id_bytes: [u8; 1] = [0; 1];

            stream.read(&mut chunk_id_bytes)?;
            (u8::from_be_bytes(chunk_id_bytes) + 64) as u16
        },
        1 => {
            let mut chunk_id_bytes: [u8; 2] = [0; 2];

            stream.read(&mut chunk_id_bytes)?;
            u16::from_le_bytes(chunk_id_bytes) + 64
        },
        n => n
    };

    Ok(
        BasicHeader {
            message_header_format,
            chunk_id
        }
    )
}

fn receive_message_header(stream: &mut TcpStream, message_header_format: u8) -> IOResult<MessageHeader> {
    if message_header_format == 0 {
        let mut timestamp_bytes: [u8; 3] = [0; 3];
        let mut message_length_bytes: [u8; 3] = [0; 3];
        let mut message_type_bytes: [u8; 1] = [0; 1];
        let mut message_id_bytes: [u8; 4] = [0; 4];

        stream.read(&mut timestamp_bytes)?;
        stream.read(&mut message_length_bytes)?;
        stream.read(&mut message_type_bytes)?;
        stream.read(&mut message_id_bytes)?;

        let mut timestamp_tmp: [u8; 4] = [0; 4];
        let mut message_length_tmp: [u8; 4] = [0; 4];

        timestamp_tmp[1..].copy_from_slice(&timestamp_bytes);
        message_length_tmp[1..].copy_from_slice(&message_length_bytes);

        let timestamp = Some(u32::from_be_bytes(timestamp_tmp));
        let message_length = Some(u32::from_be_bytes(message_length_tmp));
        let message_type = Some(message_type_bytes[0]);
        let message_id = Some(u32::from_le_bytes(message_id_bytes));

        Ok(
            MessageHeader {
                timestamp,
                message_length,
                message_type,
                message_id
            }
        )
    } else if message_header_format == 1 {
        let mut timestamp_bytes: [u8; 3] = [0; 3];
        let mut message_length_bytes: [u8; 3] = [0; 3];
        let mut message_type_bytes: [u8; 1] = [0; 1];

        stream.read(&mut timestamp_bytes)?;
        stream.read(&mut message_length_bytes)?;
        stream.read(&mut message_type_bytes)?;

        let mut timestamp_tmp: [u8; 4] = [0; 4];
        let mut message_length_tmp: [u8; 4] = [0; 4];

        timestamp_tmp[1..].copy_from_slice(&timestamp_bytes);
        message_length_tmp[1..].copy_from_slice(&message_length_bytes);

        let timestamp = Some(u32::from_be_bytes(timestamp_tmp));
        let message_length = Some(u32::from_be_bytes(message_length_tmp));
        let message_type = Some(message_type_bytes[0]);

        Ok(
            MessageHeader {
                timestamp,
                message_length,
                message_type,
                message_id: None
            }
        )
    } else if message_header_format == 2 {
        let mut timestamp_bytes: [u8; 3] = [0; 3];

        stream.read(&mut timestamp_bytes)?;

        let mut timestamp_tmp: [u8; 4] = [0; 4];

        timestamp_tmp[1..].copy_from_slice(&timestamp_bytes);

        let timestamp = Some(u32::from_be_bytes(timestamp_tmp));

        Ok(
            MessageHeader {
                timestamp,
                message_length: None,
                message_type: None,
                message_id: None
            }
        )
    } else {
        Ok(
            MessageHeader {
                timestamp: None,
                message_length: None,
                message_type: None,
                message_id: None
            }
        )
    }
}

fn receive_extended_timestamp(stream: &mut TcpStream, timestamp: u32) -> IOResult<Option<u32>> {
    if n == 0x00ffffff {
        let mut extended_timestamp_bytes: [u8; 4] = [0; 4];

        stream.read(&mut extended_timestamp_bytes)?;
        Ok(Some(u32::from_be_bytes(extended_timestamp_bytes)))
    } else {
        Ok(None)
    }
}

fn decode_connect(data: &Vec<u8>, offset: &mut usize) -> IOResult<Data> {
    let transaction_id = decode_amf_data(data, offset)?.number().unwrap();
    let command_object = decode_amf_data(data, offset)?.object().unwrap();

    Ok(
        Data::Invoke(
            InvokeCommand::NetConnection(
                NetConnectionCommand::Connect(
                    ConnectCommand::Request {
                        transaction_id,
                        command_object
                    }
                )
            )
        )
    )
}

fn decode_release_stream(data: &Vec<u8>, offset: &mut usize) -> IOResult<Data> {
    let transaction_id = decode_amf_data(data, offset)?.number().unwrap();

    // ほぼ間違いなく Null が先に続くので, それを読み飛ばす.
    decode_amf_data(data, offset)?;

    let playpath = decode_amf_data(data, offset)?.string().unwrap();

    Ok(
        Data::Invoke(
            InvokeCommand::NetConnection(
                NetConnectionCommand::ReleaseStream(
                    ReleaseStreamCommand::Request {
                        transaction_id,
                        playpath
                    }
                )
            )
        )
    )
}

fn decode_fc_publish(data: &Vec<u8>, offset: &mut usize) -> IOResult<Data> {
    let transaction_id = decode_amf_data(data, offset)?.number().unwrap();

    // 同上.
    decode_amf_data(data, offset)?;

    let playpath = decode_amf_data(data, offset)?.string().unwrap();

    Ok(
        Data::Invoke(
            InvokeCommand::FCPublish(
                FCPublishCommand::Request {
                    transaction_id,
                    playpath
                }
            )
        )
    )
}

fn decode_create_stream(data: &Vec<u8>, offset: &mut usize) -> IOResult<Data> {
    let transaction_id = decode_amf_data(data, offset)?.number().unwrap();

    // 同上.
    decode_amf_data(data, offset)?;

    Ok(
        Data::Invoke(
            InvokeCommand::NetConnection(
                NetConnectionCommand::CreateStream(
                    CreateStreamCommand::Request {
                        transaction_id
                    }
                )
            )
        )
    )
}

fn decode_invoke(data: &Vec<u8>) -> IOResult<Data> {
    let mut offset = usize::default();
    let command_name = decode_amf_data(data, &mut offset)?.string().unwrap();

    if command_name == "connect" {
        decode_connect(data, &mut offset)
    } else if command_name == "releaseStream" {
        decode_release_stream(data, &mut offset)
    } else if command_name == "FCPublish" {
        decode_fc_publish(data, &mut offset)
    } else if command_name == "createStream" {
        decode_create_stream(data, &mut offset)
    } else {
        println!("unknown command!: {}", command_name)
    }
}

fn receive_data(stream: &mut TcpStream, message_type: u8, message_length: u32) -> IOResult<Data> {
    let splits = if message_length <= DEFAULT_CHUNK_SIZE {
        0
    } else {
        message_length / DEFAULT_CHUNK_SIZE + (message_length % DEFAULT_CHUNK_SIZE > 0) as u32
    };
    let actual_message_length = (message_length + splits) as usize;
    let mut data_bytes: Vec<u8> = Vec::with_capacity(actual_message_length);

    unsafe {
        data_bytes.set_len(actual_message_length);
    }

    stream.read(data_bytes.as_mut_slice())?;

    if splits > 0 {
        let mut split_data: Vec<u8> = Vec::new();

        for i in 0..splits {
            let start = if i == 0 {
                (DEFAULT_CHUNK_SIZE * i) as usize
            } else {
                (DEFAULT_CHUNK_SIZE * i + 1) as usize;
            };
            let end = start + DEFAULT_CHUNK_SIZE as usize;

            split_data.extend_from_slice(&data_bytes[start..end]);
        }

        data_bytes = split_data;
    }

    match message_type {
        20 => decode_invoke(data_bytes),
        _ => Ok(Data::Unknown(data_bytes))
    }
}

fn receive_chunk(stream: &mut TcpStream, last_received_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<Chunk> {
    let basic_header = receive_basic_header(stream)?;
    let chunk_id = basic_header.get_chunk_id();
    let mut last_message_header = if let Some (ref mut last_message_header) = last_received_chunks.get_mut(&chunk_id) {
        *last_message_header
    } else {
        MessageHeader {
            timestamp: None,
            message_length: None,
            message_type: None,
            message_id: None
        }
    };
    let received_message_header = receive_message_header(stream, basic_header.get_message_header_format())?;
    let timestamp = if let Some(timestamp) = received_message_header.get_timestamp() {
        timestamp
    } else {
        last_message_header.get_timestamp().unwrap()
    };
    let message_length = if let Some(message_length) = received_message_header.get_message_length() {
        message_length
    } else {
        last_message_header.unwrap().get_message_length().unwrap()
    };
    let message_type = if let Some(message_type) = received_message_header.get_message_type() {
        message_type
    } else {
        last_message_header.get_message_type().unwrap()
    };
    let message_id = if let Some(message_id) = received_message_header.get_message_id() {
        message_id
    } else {
        last_message_header.get_message_id().unwrap()
    };
    let extended_timestamp = receive_extended_timestamp(stream, timestamp)?;
    let data = receive_data(stream, message_type, message_length)?;

    last_message_header.set_timestamp(timestamp);
    last_message_header.set_message_length(message_length);
    last_message_header.set_message_type(message_type);
    last_message_header.set_message_id(message_id);
    last_received_chunks.insert(chunk_id, last_message_header);

    Ok(
        Chunk {
            basic_header,
            message_header,
            extended_timestamp,
            data
        }
    )
}

fn encode_basic_header(v: &mut Vec<u8>, basic_header: BasicHeader) {
    let message_header_format = basic_header.get_message_header_format();
    let chunk_id = basic_header.get_chunk_id();
    let mut second_bytes: Vec<u8> = Vec::new();
    let first_byte = if chunk_id > 319 {
        second_bytes.extend_from_slice(&chunk_id.to_le_bytes());
        (message_header_format << 6) | 1
    } else if chunk_id > 63 {
        second_bytes.push(chunk_id as u8);
        (message_header_format << 6) | 0
    } else {
        (message_header_format << 6) | chunk_id
    };

    v.push(first_byte);
    v.append(&mut second_bytes);
}

fn encode_message_header(v: &mut Vec<u8>, message_header: MessageHeader) {
    if let Some(timestamp) = message_header.get_timestamp() {
        v.extend_from_slice(&timestamp.to_be_bytes()[1..]);
    }

    if let Some(message_length) = message_header.get_message_length() {
        v.extend_from_slice(&message_length.to_be_bytes()[1..]);
    }

    if let Some(message_type) = message_header.get_message_type() {
        v.push(message_type);
    }

    if let some(message_id) = message_header.get_message_id() {
        v.extend_from_slice(&message_id.to_le_bytes());
    }
}

fn encode_extended_timestamp(v: &mut Vec<u8>, extended_timestamp: Option<u32>) {
    if let Some(extended_timestamp) = extended_timestamp {
        v.extend_from_slice(&extended_timestamp.to_be_bytes());
    }
}

fn encode_chunk_size(v: &mut Vec<u8>, chunk_size: u32) {
    v.extend_from_slice(&chunk_size.to_be_bytes());
}

fn encode_ping(v: &mut Vec<u8>, ping_type: u16, ping_data: PingData) {
    v.extend_from_slice(&ping_type.to_be_bytes());

    match ping_data {
        PingData::StreamBegin(message_id) => v.extend_from_slice(&message_id.to_be_bytes())
    }
}

fn encode_server_bandwidth(v: &mut Vec<u8>, server_bandwidth: u32) {
    v.extend_from_slice(&server_bandwidth.to_be_bytes());
}

fn encode_client_bandwidth(v: &mut Vec<u8>, client_bandwidth: u32, limit: u8) {
    v.extend_from_slice(&client_bandwidth.to_be_bytes());
    v.push(limit);
}

fn encode_amf_number(v: &mut Vec<u8>, number: f64) {
    v.push(0);
    v.extend_from_slice(&number.to_bits().to_be_bytes());
}

fn encode_amf_boolean(v: &mut Vec<u8>, boolean: bool) {
    v.push(1);
    v.push(boolean as u8);
}

fn encode_amf_string(v: &mut Vec<u8>, mut string: String) {
    v.push(2);
    v.extend_from_slice(&(string.len() as u16).to_be_bytes());
    v.append(string.as_mut_vec());
}

fn encode_amf_object(v: &mut Vec<u8>, object: HashMap<String, AmfData>) {
    v.push(3);

    for (mut name, value) in object {
        v.extend_from_slice(&(name.len() as u16).to_be_bytes());
        v.append(name.as_mut_vec());
        encode_amf_data(v, value);
    }

    v.extend_from_slice(&[0, 0, 9]);
}

fn encode_amf_null(v: &mut Vec<u8>) {
    v.push(5);
}

fn encode_amf_data(v: &mut Vec<u8>, data: AmfData) {
    match data {
        AmfData::Number(number) => encode_amf_number(v, number),
        AmfData::Boolean(boolean) => encode_amf_boolean(v, boolean),
        AmfData::String(string) => encode_amf_string(v, string),
        AmfData::Object(object) => encode_amf_object(v, object),
        AmfData::Null => encode_amf_null(v),
        // まだ上記以外の AMF 型のデータを特定できていないため, 現段階では無視することとする.
        _ => {}
    }
}

fn encode_connect(v: &mut Vec<u8>, connect_command: ConnectCommand) {
    match connect_command {
        Connect::Response {
            transaction_id,
            properties,
            information
        } => {
            encode_amf_string(v, "_result".to_string());
            encode_amf_number(v, transaction_id);
            encode_amf_object(v, properties);
            encode_amf_object(v, information);
        },
        _ => {}
    }
}

fn encode_release_stream(v: &mut Vec<u8>, release_stream_command: ReleaseStreamCommand) {
    match release_stream_command {
        ReleaseStreamCommand::Response {
            transaction_id
        } => {
            encode_amf_string(v, "_result".to_string());
            encode_amf_number(v, transaction_id);
            encode_amf_null(v);
        },
        _ => {}
    }
}

fn encode_create_stream(v: &mut Vec<u8>, create_stream_command: CreateStreamCommand) {
    match create_stream_command {
        CreateStreamCommand::Response {
            transaction_id,
            message_id
        } => {
            encode_amf_string(v, "_result".to_string);
            encode_amf_number(v, transaction_id);
            encode_amf_null(v);
            encode_amf_number(v, message_id);
        },
        _ => {}
    }
}

fn encode_net_connection(v: &mut Vec<u8>, net_connection_command: NetConnectionCommand) {
    match net_connection_command {
        Connect(connect_command) => encode_connect(v, connect_command),
        ReleaseStream(release_stream_command) => encode_release_stream(v, release_stream_command),
        CreateStream(create_stream_command) => encode_create_stream(v, create_stream_command)
    }
}

fn encode_fc_publish(v: &mut Vec<u8>, fc_publish_command: FCPublishCommand) {
    match fc_publish_command {
        FCPublishCommand::Response => encode_amf_string(v, "onFCPublish".to_string()),
        _ => {}
    }
}

fn encode_invoke(v: &mut Vec<u8>, invoke_command: InvokeCommand) {
    match invoke_command {
        InvokeCommand::NetConnection(net_connection_command) => encode_net_connection(v, net_connection_command),
        InvokeCommand::FCPublish(fc_publish_command) => encode_fc_publish(v, fc_publish_command)
    }
}

fn encode_data(v: &mut Vec<u8>, data: Data) {
    match data {
        Data::ChunkSize(chunk_size) => encode_chunk_size(v, chunk_size),
        Data::Ping(ping_type, ping_data) => encode_ping(v, ping_type, ping_data),
        Data::ServerBandwidth(server_bandwidth) => encode_server_bandwidth(v, server_bandwidth),
        Data::ClientBandwidth(client_bandwidth, limit) => encode_client_bandwidth(v, client_bandwidth, limit),
        Data::Invoke(invoke_command) => encode_invoke(v, invoke_command)
    }
}

fn encode_chunk(v: &mut Vec<u8>, chunk: Chunk) {
    let mut data_bytes: Vec<u8> = Vec::new();

    encode_data(&mut data_bytes, chunk.get_data().clone());

    let message_length = if let Some(message_length) = chunk.get_message_header().get_message_length() {
        message_length
    } else {
        data_bytes.len() as u32
    };
    let splits = if message_length <= DEFAULT_CHUNK_SIZE {
        0
    } else {
        message_length / DEFAULT_CHUNK_SIZE + (message_length % DEFAULT_CHUNK != 0) as u32
    };

    if splits > 0 {
        let mut added: Vec<u8> = Vec::new();
        let basic_header = BasicHeader {
            message_header_format: 3,
            chunk_id: chunk.get_basic_header().get_chunk_id()
        };

        for i in 0..splits {
            if i > 0 {
                encode_basic_header(&mut added, basic_header);
            }

            let start = (DEFAULT_CHUNK_SIZE * i) as usize;
            let end = start + min(DEFAULT_CHUNK_SIZE, data_bytes[start..].len());

            added.extend_from_slice(&data_bytes[start..end]);
        }

        data_bytes = added;
    }

    encode_basic_header(v, chunk.get_basic_header());
    encode_message_header(
        v,
        MessageHeader {
            message_length,
            ..chunk.get_message_header()
        }
    );
    encode_extended_timestamp(v, chunk.get_extended_timestamp());
    v.append(&mut data_bytes);
}

fn send_chunk(stream: &mut TcpStream, chunk_id: u16, mut timestamp: u32, message_length: u32, message_type: u8, message_id: u32, data: Data, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let mut last_message_header = if let Some(ref mut last_message_header) = last_sent_chunks.get_mut(&chunk_id) {
        *last_message_header
    } else {
        MessageHeader {
            timestamp: None,
            message_length: None,
            message_type: None,
            message_id: None
        }
    };
    let last_timestamp = last_message_header.get_timestamp().unwrap_or_default();
    let last_message_length = last_message_header.get_message_length().unwrap_or_default();
    let last_message_type = last_message_header.get_message_type().unwrap_or_default();
    let last_message_id = last_message_header.get_message_id().unwrap_or_default();
    let message_header_format: u8 = if message_id == last_message_id {
        if message_length == last_message_length && message_type == last_message_type {
            if timestamp == last_timestamp {
                3
            } else {
                2
            }
        } else {
            1
        }
    } else {
        0
    };
    let basic_header = BasicHeader {
        message_header_format,
        chunk_id
    };
    let extended_timestamp = if timestamp >= 0x00ffffff as u32 {
        let extended_timestamp = Some(timestamp);

        timestamp = 0x00ffffff;
        extended_timestamp
    } else {
        None
    };
    let message_header = match message_header_format {
        0 => MessageHeader {
            timestamp,
            message_length,
            message_type,
            message_id
        },
        1 => MessageHeader {
            timestamp,
            message_length,
            message_type,
            message_id: None
        },
        2 => MessageHeader {
            timestamp,
            message_length: None,
            message_type: None,
            message_id: None
        },
        3 => MessageHeader {
            timestamp: None,
            message_length: None,
            message_type: None,
            message_id: None
        },
        n => panic!("what's this!?: {}", n)
    };
    let chunk = Chunk {
        basic_header,
        message_header,
        extended_timestamp,
        data
    };
    let mut v: Vec<u8> = Vec::new();

    encode_chunk(&mut v, chunk);
    stream.write(v.as_slice()).map(|_| ())
}

/* 送信時のタイムスタンプやメッセージストリーム ID の実際の渡し方については後述する. */

fn send_chunk_size(stream: &mut TcpStream, chunk_size: u32, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    if chunk_size < 1 || chunk_size > 0x7fffffff {
        return Err(ErrorKind::InvalidData.into());
    }

    send_chunk(stream, 2, 0, 4, 1, 0, Data::ChunkSize(chunk_size), last_sent_chunks)
}

fn send_stream_begin(stream: &mut TcpStream, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    send_chunk(stream, 2, 0, 6, 4, 0, Data::Ping(1, PingData::StreamBegin(0)), last_sent_chunks)
}

fn send_ping(stream: &mut TcpStream, ping_type: u16, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    match ping_type {
        1 => send_stream_begin(stream, last_sent_chunks),
        n => panic!("what's this!?: {}", n)
    }
}

fn send_server_bandwidth(stream: &mut TcpStream, server_bandwidth: u32, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    send_chunk(2, 0, 4, 5, 0, Data::ServerBandwidth(server_bandwidth), last_sent_chunks)
}

fn send_client_bandwidth(stream: &mut TcpStream, client_bandwidth: u32, limit: u8, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    send_chunk(2, 0, 5, 6, 0, Data::ClientBandwidth(client_bandwidth, limit), last_sent_chunks)
}

fn send_invoke(stream: &mut TcpStream, invoke_command: InvokeCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let mut v: Vec<u8> = Vec::new();

    encode_data(&mut v, Data::Invoke(invoke_command.clone()));
    send_chunk(3, 0, v.len(), 20, 0, Data::Invoke(invoke_command), last_sent_chunks)
}

fn send_connect_response(stream: &mut TcpStream, connect_command: ConnectCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let transaction_id = connect_command.get_received_transaction_id().unwrap();
    let mut properties: HashMap<String, AmfData> = HashMap::new();
    let mut information: HashMap<String, AmfData> = HashMap::new();

    properties.insert("fmsVer".to_string(), AmfData::String("FMS/3,0,1,123".to_string()));
    properties.insert("capabilities".to_string(), AmfData::Number(31 as f64));
    information.insert("level".to_string(), AmfData::String("status".to_string()));
    information.insert("code".to_string(), AmfData::String("NetConnection.Connect.Success".to_string()));
    information.insert("description".to_string(), AmfData::String("Connection succeeded.".to_string()));
    information.insert("objectEncoding".to_string(), AmfData::Number(0 as f64));

    let invoke = Data::Invoke(
        InvokeCommand::NetConnection(
            NetConnectionCommand::Connect(
                ConnectCommand::Response {
                    transaction_id,
                    properties,
                    information
                }
            )
        )
    );

    send_invoke(stream, invoke.clone(), last_sent_chunks)?;
    send_server_bandwidth(stream, DEFAULT_BANDWIDTH, last_sent_chunks)?;
    send_client_bandwidth(stream, DEFAULT_BANDWIDTH, last_sent_chunks)?;
    send_ping(stream, 1, last_sent_chunks)?;
    send_chunk_size(stream, DEFAULT_CHUNK_SIZE, last_sent_chunks)?;
    send_invoke(stream, invoke, last_sent_chunks)
}

fn send_release_stream_response(stream: &mut TcpStream, release_stream_command: ReleaseStreamCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let transaction_id = release_stream_command.get_received_trnasaction_id().unwrap();
    let invoke = Data::Invoke(
        InvokeCommand::NetConnection(
            NetConnectionCommand::ReleaseStream(
                ReleaseStreamCommand::Response {
                    transaction_id
                }
            )
        )
    );

    send_invoke(stream, invoke, last_sent_chunks)
}

fn send_create_stream_response(stream: &mut TcpStream, create_stream_command: CreateStreamCommand, message_id: f64, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let transaction_id = create_stream_command.get_received_transaction_id().unwrap();
    let invoke = Data::Invoke(
        InvokeCommand::NetConnection(
            NetConnectionCommand::CreateStream(
                CreateStreamCommand::Response {
                    transaction_id,
                    message_id
                }
            )
        )
    );

    send_invoke(stream, invoke, last_sent_chunks)
}

fn send_net_connection_response(stream: &mut TcpStream, net_connection_command: NetConnectionCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    match net_connection_command {
        NetConnectionCommand::Connect(connect_command) => send_connect_response(stream, connect_command, last_sent_chunks),
        NetConnectionCommand::ReleaseStream(release_stream_command) => send_release_stream_response(stream, release_stream_command, last_sent_chunks),
        NetConnectionCommand::CreateStream(create_stream_command) => send_create_stream_command(stream, create_stream_command, last_sent_chunks)
    }
}

fn send_fc_publish_response(stream: &mut TcpStream, fc_publish_command: FCPublishCommand) -> IOResult<()> {
    let transaction_id = fc_publish_command.get_received_transaction_id().unwrap();
    let invoke = Data::Invoke(
        InvokeCommand::FCPublish(
            FCPublishCommand::Response
        )
    );

    send_invoke(stream, invoke, last_sent_chunks)
}

fn send_invoke_response(stream: &mut TcpStream, invoke_command: InvokeCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    match invoke_command {
        InvokeCommand::NetConnection(net_connection_command) => send_net_connection_response(stream, net_connection_command, last_sent_chunks),
        InvokeCommand::FCPublish(fc_publish_command) => send_fc_publish_response(stream, fc_publish, last_sent_chunks)
    }
}

fn main() -> IOResult<()> {
    let listener: TcpListener::bind("127.0.0.1:1935")?;
    let mut last_received_chunks: HashMap<u16, MessageHeader> = HashMap::new();
    let mut last_sent_chunks: HashMap<u16, MessageHeader> = HashMap::new();

    for incoming in listener.incoming() {
        let mut stream = incoming?;

        /* connect コマンドへの返送までは完了しているとみなす. */

        // 以降は要求チャンクの受信とそれらへの返送の連続であるため, loop でストリームを維持する.
        loop {
            let received_chunk = receive_chunk(&mut stream, &mut last_received_chunks)?;

            match received_chunk.get_data().clone() {
                Data::Invoke(invoke_command) => send_invoke_response(&mut stream, invoke_command, &mut last_sent_chunks)?,
                _ => {}
            }
        }
    }
}
```

上記の実装で一つもエラーが発生しなければ, 送受信するチャンクを記憶しながら releaseStream, FCPublish, createStream (および connect) コマンドを返送する処理は完了である.

### publish

NetConnection コマンド (connect, releaseStream, createStream) および FCPublish コマンドの送受信が完了すると, 次にサーバ側はクライアント側から publish コマンドを受信する. ここで, publish コマンドに入力されている値を以下に記す. 公式ドキュメント[^RTMP-Specification-1.0]では以下のように指定されている.

|コマンド名|チャンクストリーム ID|タイムスタンプ|メッセージ長|メッセージの種類|メッセージストリーム ID|チャンクデータ                                 |
| :------- | ------------------: | -----------: | ---------: | -------------: | ---------------------: | :-------------------------------------------- |
|publish   |3                    |0             |?           |20              |0                       | * コマンド名: publish                         |  \
|          |                     |              |            |                |                        | * トランザクションID: 0                       |  \
|          |                     |              |            |                |                        | * コマンドオブジェクト: Null                  |  \
|          |                     |              |            |                |                        | * 公開名 (何らかの文字列)                     |  \
|          |                     |              |            |                |                        | * 公開の種類: live, record, append のいずれか |

一方で, FFmpeg では以下のように入力されている.

|コマンド名|チャンクストリーム ID|タイムスタンプ|メッセージ長|メッセージの種類|メッセージストリーム ID|チャンクデータ|
| :------- | ------------------: | -----------: | ---------: | -------------: | ---------------------: | :-------------------------------------------- |
|publish   |3                    |0             |?           |20              |0                       | * コマンド名: publish                         |  \
|          |                     |              |            |                |                        | * トランザクション ID: **5** (おそらく)       |  \
|          |                     |              |            |                |                        | * コマンドオブジェクト: Null                  |  \
|          |                     |              |            |                |                        | * 公開名 (何らかの文字列)                     |  \
|          |                     |              |            |                |                        | * 公開の種類: live, record, append のいずれか |

「公開の種類」はそれぞれ以下を意味する.

* live: 受信した映像・音声データを**ファイルに記録せず**に他のクライアントに転送する.
* record: 受信した映像・音声データを**新規のファイルとして記録**しながら, 他のクライアントに転送する.
* append: 受信した映像・音声データを**既存のファイルに追記**しながら, 他のクライアントに転送する.

#### publish コマンドの受信

次に, 上記チャンクを受信する例を以下に記す.

```rust
use std::{
    collections::{
        HashMap
    },
    io::{
        Error as IOError,
        ErrorKind,
        Read,
        Result as IOResult
    },
    net::{
        TcpListener,
        TcpStream
    }
};

#[derive(Clone, Copy)]
struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

impl BasicHeader {
    fn get_message_header_format(&self) -> u8 {
        self.message_header_format
    }

    fn get_chunk_id(&self) -> u16 {
        self.chunk_id
    }
}

#[derive(Clone, Copy)]
struct MessageHeader {
    timestamp: Option<u32>,
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

impl MessageHeader {
    fn get_timestamp(&self) -> Option<u32> {
        self.timestamp
    }

    fn set_timestamp(&mut self, timestamp: u32) {
        self.timestamp = Some(timestamp);
    }

    fn get_message_length(&self) -> Option<u32> {
        self.message_length
    }

    fn set_message_length(&mut self, message_length: u32) {
        self.message_length = Some(message_length);
    }

    fn get_message_type(&self) -> Option<u8> {
        self.message_type
    }

    fn set_message_type(&mut self, message_type: u8) {
        self.message_type = Some(message_type);
    }

    fn get_message_id(&self) -> Option<u32> {
        self.mmessage_id
    }

    fn set_message_id(&mut self, message_id: u32) {
        self.message_id = Some(message_id);
    }
}

#[derive(Clone, Copy)]
enum PingData {
    StreamBegin(u32)
}

#[derive(Clone)]
enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Null,
    Unknown
}

impl AmfData {
    fn number(self) -> Option<f64> {
        match self {
            AmfData::Number(number) => Some(number),
            _ => None
        }
    }

    fn boolean(self) -> Option<bool> {
        match self {
            AmfData::Boolean(boolean) => Some(boolean),
            _ => None
        }
    }

    fn string(self) -> Option<String> {
        match self {
            AmfData::String(string) => Some(string),
            _ => None
        }
    }

    fn object(self) -> Option<HashMap<String, AmfData>> {
        match self {
            AmfData::Object(object) => Some(object),
            _ => None
        } 
    }
}

#[derive(Clone)]
enum ConnectCommand {
    Request {
        transaction_id: f64,
        command_object: HashMap<String, AmfData>
    },
    Response {
        transaction_id: f64,
        properties: HashMap<String, AmfData>,
        information: HashMap<String, AmfData>
    }
}

#[derive(Clone)]
enum ReleaseStreamCommand {
    Request {
        transaction_id: f64,
        playpath: String
    },
    Response {
        transaction_id: f64
    }
}

impl ReleaseStreamCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            ReleaseStreamCommand::Request {
                transaction_id,
                play_path: _
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum CreateStreamCommand {
    Request {
        transaction_id: f64
    },
    Response {
        transaction_id: f64,
        message_id: f64
    }
}

impl CreateStreamCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            CreateStreamCommand::Request {
                transaction_id
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum NetConnectionCommand {
    Connect(ConnectCommand),
    ReleaseStream(ReleaseStreamCommand),
    CreateStream(CreateStreamCommand)
}

#[derive(Clone)]
enum FCPublishCommand {
    Request {
        transaction_id: f64,
        playpath: String
    },
    Response
}

impl FCPublishCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            FCPublishCommand::Request {
                transaction_id,
                playpath: _
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum PublishCommand {
    Request {
        transaction_id: f64,
        publishing_name: String,
        publishing_type: String
    },
    Response {
        transaction_id: f64,
        information: HashMap<String, AmfData>
    }
}

impl PublishCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            Request {
                transaction_id,
                publishing_name: _,
                publishing_type: _
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum NetStreamCommand {
    Publish(PublishCommand)
}

#[derive(Clone)]
enum InvokeCommand {
    NetConnection(NetConnectionCommand),
    NetStream(NetStreamCommand),
    FCPublish(FCPublishCommand)
}

#[derive(Clone)]
enum Data {
    ChunkSize(u32),
    Ping(u16, PingData),
    ServerBandwidth(u32),
    ClientBandwidth(u32, u8),
    Invoke(InvokeCommand),
    Unknown(Vec<u8>)
}

struct Chunk {
    basic_header: BasicHeader,
    message_header: MessageHeader,
    extended_timestamp: Option<u32>,
    data: Data
}

impl Chunk {
    fn get_basic_header(&self) -> BasicHeader {
        self.basic_header
    }

    fn get_message_header(&self) -> MessageHeader {
        self.message_header
    }

    fn get_extended_timestamp(&self) -> Option<u32> {
        self.extended_timestamp
    }

    fn get_data(&self) -> &Data {
        &self.data
    }
}

fn decode_amf_number(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let mut number_bytes: [u8; 8] = [0; 8];

    number_bytes.copy_from_slice(&data[*offset..(*offset + 8)]);
    *offset += 8;

    let number = f64::from_bits(u64::from_be_bytes(number_bytes));

    Ok(AmfData::Number(number))
}

fn decode_amf_boolean(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let boolean = data[*offset] > 0;

    *offset += 1;
    Ok(AmfData::Boolean(boolean))
}

fn decode_amf_string(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let mut length_bytes: [u8; 2] = [0; 2];

    length_bytes.copy_from_slice(&data[*offset..(*offset + 2)]);
    *offset += 2;

    let string = String::from_utf8(data[*offset..(*offset + length)].to_vec()).map_err(
        |_| IOError::from(ErrorKind::InvalidData)
    )?;

    *offset += length;
    Ok(AmfData::String(string))
}

fn decode_amf_object(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    let mut object: HashMap<String, AmfData> = HashMap::new();

    while &data[*offset..(*offset + 3)] != &[0, 0, 9] {
        let name = decode_amf_string(data, offset)?.string().unwrap();
        let value = decode_amf_data(data, offset)?;

        object.insert(name, value);
    }

    Ok(AmfData::Object(object))
}

fn decode_amf_null(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    Ok(AmfData::Null)
}

fn decode_amf_unknown(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    /* 当該部分の実装は後述する. */
    Ok(AmfData::Unknown)
}

fn decode_amf_data(data: &Vec<u8>, offset: &mut usize) -> IOResult<AmfData> {
    match data[*offset] {
        0 => {
            *offset += 1;
            decode_amf_number(data, offset)
        },
        1 => {
            *offset += 1;
            decode_amf_boolean(data, offset)
        },
        2 => {
            *offset += 1;
            decode_amf_string(data, offset)
        },
        3 => {
            *offset += 1;
            decode_amf_object(data, offset)
        },
        5 => {
            *offset += 1;
            decode_amf_null(data, offset)
        },
        _ => {
            *offset += 1;
            decode_amf_unknown()
        }
    }
}

fn receive_basic_header(stream: &mut TcpStream) -> IOResult<BasicHeader> {
    let mut first_byte: [u8; 1] = [0; 1];

    stream.read(&mut first_byte)?;

    let message_header_format = (first_byte[0] & 0xc0) >> 6;
    let chunk_id = match first_byte[0] & 0x3f {
        0 => {
            let mut chunk_id_bytes: [u8; 1] = [0; 1];

            stream.read(&mut chunk_id_bytes)?;
            (u8::from_be_bytes(chunk_id_bytes) + 64) as u16
        },
        1 => {
            let mut chunk_id_bytes: [u8; 2] = [0; 2];

            stream.read(&mut chunk_id_bytes)?;
            u16::from_le_bytes(chunk_id_bytes) + 64
        },
        n => n
    };

    Ok(
        BasicHeader {
            message_header_format,
            chunk_id
        }
    )
}

fn receive_message_header(stream: &mut TcpStream, message_header_format: u8) -> IOResult<MessageHeader> {
    if message_header_format == 0 {
        let mut timestamp_bytes: [u8; 3] = [0; 3];
        let mut message_length_bytes: [u8; 3] = [0; 3];
        let mut message_type_bytes: [u8; 1] = [0; 1];
        let mut message_id_bytes: [u8; 4] = [0; 4];

        stream.read(&mut timestamp_bytes)?;
        stream.read(&mut message_length_bytes)?;
        stream.read(&mut message_type_bytes)?;
        stream.read(&mut message_id_bytes)?;

        let mut timestamp_tmp: [u8; 4] = [0; 4];
        let mut message_length_tmp: [u8; 4] = [0; 4];

        timestamp_tmp[1..].copy_from_slice(&timestamp_bytes);
        message_length_tmp[1..].copy_from_slice(&message_length_bytes);

        let timestamp = Some(u32::from_be_bytes(timestamp_tmp));
        let message_length = Some(u32::from_be_bytes(message_length_tmp));
        let message_type = Some(message_type_bytes[0]);
        let message_id = Some(u32::from_le_bytes(message_id_bytes));

        Ok(
            MessageHeader {
                timestamp,
                message_length,
                message_type,
                message_id
            }
        )
    } else if message_header_format == 1 {
        let mut timestamp_bytes: [u8; 3] = [0; 3];
        let mut message_length_bytes: [u8; 3] = [0; 3];
        let mut message_type_bytes: [u8; 1] = [0; 1];

        stream.read(&mut timestamp_bytes)?;
        stream.read(&mut message_length_bytes)?;
        stream.read(&mut message_type_bytes)?;

        let mut timestamp_tmp: [u8; 4] = [0; 4];
        let mut message_length_tmp: [u8; 4] = [0; 4];

        timestamp_tmp[1..].copy_from_slice(&timestamp_bytes);
        message_length_tmp[1..].copy_from_slice(&message_length_bytes);

        let timestamp = Some(u32::from_be_bytes(timestamp_tmp));
        let message_length = Some(u32::from_be_bytes(message_length_tmp));
        let message_type = Some(message_type_bytes[0]);

        Ok(
            MessageHeader {
                timestamp,
                message_length,
                message_type,
                message_id: None
            }
        )
    } else if message_header_format == 2 {
        let mut timestamp_bytes: [u8; 3] = [0; 3];

        stream.read(&mut timestamp_bytes)?;

        let mut timestamp_tmp: [u8; 4] = [0; 4];

        timestamp_tmp[1..].copy_from_slice(&timestamp_bytes);

        let timestamp = Some(u32::from_be_bytes(timestamp_tmp));

        Ok(
            MessageHeader {
                timestamp,
                message_length: None,
                message_type: None,
                message_id: None
            }
        )
    } else {
        Ok(
            MessageHeader {
                timestamp: None,
                message_length: None,
                message_type: None,
                message_id: None
            }
        )
    }
}

fn receive_extended_timestamp(stream: &mut TcpStream, timestamp: u32) -> IOResult<Option<u32>> {
    if n == 0x00ffffff {
        let mut extended_timestamp_bytes: [u8; 4] = [0; 4];

        stream.read(&mut extended_timestamp_bytes)?;
        Ok(Some(u32::from_be_bytes(extended_timestamp_bytes)))
    } else {
        Ok(None)
    }
}

fn decode_connect(data: &Vec<u8>, offset: &mut usize) -> IOResult<Data> {
    let transaction_id = decode_amf_data(data, offset)?.number().unwrap();
    let command_object = decode_amf_data(data, offset)?.object().unwrap();

    Ok(
        Data::Invoke(
            InvokeCommand::NetConnection(
                NetConnectionCommand::Connect(
                    ConnectCommand::Request {
                        transaction_id,
                        command_object
                    }
                )
            )
        )
    )
}

fn decode_release_stream(data: &Vec<u8>, offset: &mut usize) -> IOResult<Data> {
    let transaction_id = decode_amf_data(data, offset)?.number().unwrap();

    decode_amf_data(data, offset)?;

    let playpath = decode_amf_data(data, offset)?.string().unwrap();

    Ok(
        Data::Invoke(
            InvokeCommand::NetConnection(
                NetConnectionCommand::ReleaseStream(
                    ReleaseStreamCommand::Request {
                        transaction_id,
                        playpath
                    }
                )
            )
        )
    )
}

fn decode_fc_publish(data: &Vec<u8>, offset: &mut usize) -> IOResult<Data> {
    let transaction_id = decode_amf_data(data, offset)?.number().unwrap();

    decode_amf_data(data, offset)?;

    let playpath = decode_amf_data(data, offset)?.string().unwrap();

    Ok(
        Data::Invoke(
            InvokeCommand::FCPublish(
                FCPublishCommand::Request {
                    transaction_id,
                    playpath
                }
            )
        )
    )
}

fn decode_create_stream(data: &Vec<u8>, offset: &mut usize) -> IOResult<Data> {
    let transaction_id = decode_amf_data(data, offset)?.number().unwrap();

    decode_amf_data(data, offset)?;

    Ok(
        Data::Invoke(
            InvokeCommand::NetConnection(
                NetConnectionCommand::CreateStream(
                    CreateStreamCommand::Request {
                        transaction_id
                    }
                )
            )
        )
    )
}

fn decode_publish(data: &Vec<u8>, offset: &mut usize) -> IOResult<Data> {
    let transaction_id = decode_amf_data(data, offset)?.number().unwrap();

    decode_amf_data(data, offset)?;

    let publishing_name = decode_amf_data(data, offset)?.string().unwrap();
    let publishing_type = decode_amf_data(data, offset)?.string().unwrap();

    Ok(
        Data::Invoke(
            InvokeCommand::NetStream(
                NetStreamCommand::Publish(
                    PublishCommand::Request {
                        transaction_id,
                        publishing_name,
                        publishing_type
                    }
                )
            )
        )
    )
}

fn decode_invoke(data: &Vec<u8>) -> IOResult<Data> {
    let mut offset = usize::default();
    let command_name = decode_amf_data(data, &mut offset)?.string().unwrap();

    if command_name == "connect" {
        decode_connect(data, &mut offset)
    } else if command_name == "releaseStream" {
        decode_release_stream(data, &mut offset)
    } else if command_name == "FCPublish" {
        decode_fc_publish(data, &mut offset)
    } else if command_name == "createStream" {
        decode_create_stream(data, &mut offset)
    } else if command_name == "publish" {
        decode_publish(data, &mut offset)
    } else {
        println!("unknown command!: {}", command_name)
    }
}

fn receive_data(stream: &mut TcpStream, message_type: u8, message_length: u32) -> IOResult<Data> {
    let splits = if message_length <= DEFAULT_CHUNK_SIZE {
        0
    } else {
        message_length / DEFAULT_CHUNK_SIZE + (message_length % DEFAULT_CHUNK_SIZE > 0) as u32
    };
    let actual_message_length = (message_length + splits) as usize;
    let mut data_bytes: Vec<u8> = Vec::with_capacity(actual_message_length);

    unsafe {
        data_bytes.set_len(actual_message_length);
    }

    stream.read(data_bytes.as_mut_slice())?;

    if splits > 0 {
        let mut split_data: Vec<u8> = Vec::new();

        for i in 0..splits {
            let start = if i == 0 {
                (DEFAULT_CHUNK_SIZE * i) as usize
            } else {
                (DEFAULT_CHUNK_SIZE * i + 1) as usize;
            };
            let end = start + DEFAULT_CHUNK_SIZE as usize;

            split_data.extend_from_slice(&data_bytes[start..end]);
        }

        data_bytes = split_data;
    }

    match message_type {
        20 => decode_invoke(data_bytes),
        _ => Ok(Data::Unknown(data_bytes))
    }
}

fn receive_chunk(stream: &mut TcpStream, last_received_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<Chunk> {
    let basic_header = receive_basic_header(stream)?;
    let chunk_id = basic_header.get_chunk_id();
    let mut last_message_header = if let Some (ref mut last_message_header) = last_received_chunks.get_mut(&chunk_id) {
        *last_message_header
    } else {
        MessageHeader {
            timestamp: None,
            message_length: None,
            message_type: None,
            message_id: None
        }
    };
    let received_message_header = receive_message_header(stream, basic_header.get_message_header_format())?;
    let timestamp = if let Some(timestamp) = received_message_header.get_timestamp() {
        timestamp
    } else {
        last_message_header.get_timestamp().unwrap()
    };
    let message_length = if let Some(message_length) = received_message_header.get_message_length() {
        message_length
    } else {
        last_message_header.unwrap().get_message_length().unwrap()
    };
    let message_type = if let Some(message_type) = received_message_header.get_message_type() {
        message_type
    } else {
        last_message_header.get_message_type().unwrap()
    };
    let message_id = if let Some(message_id) = received_message_header.get_message_id() {
        message_id
    } else {
        last_message_header.get_message_id().unwrap()
    };
    let extended_timestamp = receive_extended_timestamp(stream, timestamp)?;
    let data = receive_data(stream, message_type, message_length)?;

    last_message_header.set_timestamp(timestamp);
    last_message_header.set_message_length(message_length);
    last_message_header.set_message_type(message_type);
    last_message_header.set_message_id(message_id);
    last_received_chunks.insert(chunk_id, last_message_header);

    Ok(
        Chunk {
            basic_header,
            message_header,
            extended_timestamp,
            data
        }
    )
}

fn main() -> IOResult<()> {
    let listener: TcpListener::bind("127.0.0.1:1935")?;
    let mut last_received_chunks: HashMap<u16, MessageHeader> = HashMap::new();
    let mut last_sent_chunks: HashMap<u16, MessageHeader> = HashMap::new();

    for incoming in listener.incoming() {
        let mut stream = incoming?;

        loop {
            let received_chunk = receive_chunk(&mut stream, &mut last_received_chunks)?;

            match received_chunk.get_data().clone() {
                Data::Invoke(invoke_command) => send_invoke_response(&mut stream, invoke_command, &mut last_sent_chunks)?,
                _ => {}
            }
        }
    }
}
```

#### publish コマンド要求への返送手順

サーバ側は上記の実装でクライアント側から受信した publish コマンド要求に対して, 以下の二種類の返送チャンクを送信する.

1. Ping(Stream Begin) チャンク
2. Invoke(onStatus) チャンク

ここで, 当該返送処理に必要な通信の手順を以下に改めて記す.

<div id="rtmp-invoke-publish-sequences">

!!!include(invoke-publish-sequences-ffmpeg.md)!!!

</div>

図2. Invoke(publish) チャンクの送受信手順 {#caption-rtmp-invoke-publish-sequences}

次に onStatus コマンドに入力する値を記す. 公式ドキュメント[^RTMP-Specification-1.0]では以下のように指定されている.

|コマンド名|チャンクストリーム ID|タイムスタンプ|メッセージ長|メッセージの種類 (ID)|メッセージストリーム ID|チャンクデータ                                                          |
| :------- | ------------------: | -----------: | ---------: | ------------------: | --------------------: | :--------------------------------------------------------------------- |
|onStatus  |3                    |0             |?           |20                   |                       | * コマンド名: onStatus                                                 |  \
|          |                     |              |            |                     |                       | * トランザクション ID: 0                                               |  \
|          |                     |              |            |                     |                       | * インフォメーション:                                                  |  \
|          |                     |              |            |                     |                       |   * level: このメッセージのレベル. status, warn, error のいずれか一つ. |  \
|          |                     |              |            |                     |                       |   * code: メッセージコード. 例えば, NetStream.Play.Start.              |  \
|          |                     |              |            |                     |                       |   * description: メッセージの人間が読める説明.                         |

注: インフォメーションはコードへ必要に応じて他のプロパティを含め**てもよい**.

一方で, FFmpeg では以下の値が入力されている.

|コマンド名|チャンクストリーム ID|タイムスタンプ|メッセージ長|メッセージの種類 (ID)|メッセージストリーム ID|チャンクデータ                                |
| :------- | ------------------: | -----------: | ---------: | ------------------: | --------------------: | :------------------------------------------- |
|onStatus  |3                    |0             |?           |20                   |                       | * コマンド名: onStatus                       |  \
|          |                     |              |            |                     |                       | * トランザクション ID: 0                     |  \
|          |                     |              |            |                     |                       | * インフォメーション:                        |  \
|          |                     |              |            |                     |                       |   * level: status                            |  \
|          |                     |              |            |                     |                       |   * code: NetStream.Publish.Start            |  \
|          |                     |              |            |                     |                       |   * description: *playpath* is now published |  \
|          |                     |              |            |                     |                       |   * details: *playpath* の値                 |

次に, 返送チャンクを送信する例を以下に記す.

```rust
use std::{
    collections::{
        HashMap
    },
    io::{
        Error as IOError,
        ErrorKind,
        Result as IOResult,
        Write
    },
    net::{
        TcpListener,
        TcpStream
    }
};

#[derive(Clone, Copy)]
struct BasicHeader {
    message_header_format: u8,
    chunk_id: u16
}

impl BasicHeader {
    fn get_message_header_format(&self) -> u8 {
        self.message_header_format
    }

    fn get_chunk_id(&self) -> u16 {
        self.chunk_id
    }
}

#[derive(Clone, Copy)]
struct MessageHeader {
    timestamp: Option<u32>,
    message_length: Option<u32>,
    message_type: Option<u8>,
    message_id: Option<u32>
}

impl MessageHeader {
    fn get_timestamp(&self) -> Option<u32> {
        self.timestamp
    }

    fn set_timestamp(&mut self, timestamp: u32) {
        self.timestamp = Some(timestamp);
    }

    fn get_message_length(&self) -> Option<u32> {
        self.message_length
    }

    fn set_message_length(&mut self, message_length: u32) {
        self.message_length = Some(message_length);
    }

    fn get_message_type(&self) -> Option<u8> {
        self.message_type
    }

    fn set_message_type(&mut self, message_type: u8) {
        self.message_type = Some(message_type);
    }

    fn get_message_id(&self) -> Option<u32> {
        self.mmessage_id
    }

    fn set_message_id(&mut self, message_id: u32) {
        self.message_id = Some(message_id);
    }
}

#[derive(Clone, Copy)]
enum PingData {
    StreamBegin(u32)
}

#[derive(Clone)]
enum AmfData {
    Number(f64),
    Boolean(bool),
    String(String),
    Object(HashMap<String, AmfData>),
    Null,
    Unknown
}

impl AmfData {
    fn number(self) -> Option<f64> {
        match self {
            AmfData::Number(number) => Some(number),
            _ => None
        }
    }

    fn boolean(self) -> Option<bool> {
        match self {
            AmfData::Boolean(boolean) => Some(boolean),
            _ => None
        }
    }

    fn string(self) -> Option<String> {
        match self {
            AmfData::String(string) => Some(string),
            _ => None
        }
    }

    fn object(self) -> Option<HashMap<String, AmfData>> {
        match self {
            AmfData::Object(object) => Some(object),
            _ => None
        } 
    }
}

#[derive(Clone)]
enum ConnectCommand {
    Request {
        transaction_id: f64,
        command_object: HashMap<String, AmfData>
    },
    Response {
        transaction_id: f64,
        properties: HashMap<String, AmfData>,
        information: HashMap<String, AmfData>
    }
}

#[derive(Clone)]
enum ReleaseStreamCommand {
    Request {
        transaction_id: f64,
        playpath: String
    },
    Response {
        transaction_id: f64
    }
}

impl ReleaseStreamCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            ReleaseStreamCommand::Request {
                transaction_id,
                play_path: _
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum CreateStreamCommand {
    Request {
        transaction_id: f64
    },
    Response {
        transaction_id: f64,
        message_id: f64
    }
}

impl CreateStreamCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            CreateStreamCommand::Request {
                transaction_id
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum NetConnectionCommand {
    Connect(ConnectCommand),
    ReleaseStream(ReleaseStreamCommand),
    CreateStream(CreateStreamCommand)
}

#[derive(Clone)]
enum FCPublishCommand {
    Request {
        transaction_id: f64,
        playpath: String
    },
    Response
}

impl FCPublishCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            FCPublishCommand::Request {
                transaction_id,
                playpath: _
            } => Some(transaction_id),
            _ => None
        }
    }
}

#[derive(Clone)]
enum PublishCommand {
    Request {
        transaction_id: f64,
        publishing_name: String,
        publishing_type: String
    },
    Response {
        transaction_id: f64,
        information: HashMap<String, AmfData>
    }
}

impl PublishCommand {
    fn get_received_transaction_id(&self) -> Option<f64> {
        match *self {
            PublishCommand::Request {
                transaction_id,
                publishing_name: _,
                publishing_type: _
            } => Some(transaction_id),
            _ => None
        }
    }

    fn get_received_publishing_name(&self) -> Option<String> {
        match *self {
            PublishCommand::Request {
                transaction_id: _,
                publishing_name,
                publishing_type: _
            } => Some(publishing_name),
            _ => None
        }
    }
}

#[derive(Clone)]
enum NetStreamCommand {
    Publish(PublishCommand)
}

#[derive(Clone)]
enum InvokeCommand {
    NetConnection(NetConnectionCommand),
    NetStream(NetStreamCommand),
    FCPublish(FCPublishCommand)
}

#[derive(Clone)]
enum Data {
    ChunkSize(u32),
    Ping(u16, PingData),
    ServerBandwidth(u32),
    ClientBandwidth(u32, u8),
    Invoke(InvokeCommand),
    Unknown(Vec<u8>)
}

struct Chunk {
    basic_header: BasicHeader,
    message_header: MessageHeader,
    extended_timestamp: Option<u32>,
    data: Data
}

impl Chunk {
    fn get_basic_header(&self) -> BasicHeader {
        self.basic_header
    }

    fn get_message_header(&self) -> MessageHeader {
        self.message_header
    }

    fn get_extended_timestamp(&self) -> Option<u32> {
        self.extended_timestamp
    }

    fn get_data(&self) -> &Data {
        &self.data
    }
}

fn encode_basic_header(v: &mut Vec<u8>, basic_header: BasicHeader) {
    let message_header_format = basic_header.get_message_header_format();
    let chunk_id = basic_header.get_chunk_id();
    let mut second_bytes: Vec<u8> = Vec::new();
    let first_byte = if chunk_id > 319 {
        second_bytes.extend_from_slice(&chunk_id.to_le_bytes());
        (message_header_format << 6) | 1
    } else if chunk_id > 63 {
        second_bytes.push(chunk_id as u8);
        (message_header_format << 6) | 0
    } else {
        (message_header_format << 6) | chunk_id
    };

    v.push(first_byte);
    v.append(&mut second_bytes);
}

fn encode_message_header(v: &mut Vec<u8>, message_header: MessageHeader) {
    if let Some(timestamp) = message_header.get_timestamp() {
        v.extend_from_slice(&timestamp.to_be_bytes()[1..]);
    }

    if let Some(message_length) = message_header.get_message_length() {
        v.extend_from_slice(&message_length.to_be_bytes()[1..]);
    }

    if let Some(message_type) = message_header.get_message_type() {
        v.push(message_type);
    }

    if let some(message_id) = message_header.get_message_id() {
        v.extend_from_slice(&message_id.to_le_bytes());
    }
}

fn encode_extended_timestamp(v: &mut Vec<u8>, extended_timestamp: Option<u32>) {
    if let Some(extended_timestamp) = extended_timestamp {
        v.extend_from_slice(&extended_timestamp.to_be_bytes());
    }
}

fn encode_chunk_size(v: &mut Vec<u8>, chunk_size: u32) {
    v.extend_from_slice(&chunk_size.to_be_bytes());
}

fn encode_ping(v: &mut Vec<u8>, ping_type: u16, ping_data: PingData) {
    v.extend_from_slice(&ping_type.to_be_bytes());

    match ping_data {
        PingData::StreamBegin(message_id) => v.extend_from_slice(&message_id.to_be_bytes())
    }
}

fn encode_server_bandwidth(v: &mut Vec<u8>, server_bandwidth: u32) {
    v.extend_from_slice(&server_bandwidth.to_be_bytes());
}

fn encode_client_bandwidth(v: &mut Vec<u8>, client_bandwidth: u32, limit: u8) {
    v.extend_from_slice(&client_bandwidth.to_be_bytes());
    v.push(limit);
}

fn encode_amf_number(v: &mut Vec<u8>, number: f64) {
    v.push(0);
    v.extend_from_slice(&number.to_bits().to_be_bytes());
}

fn encode_amf_boolean(v: &mut Vec<u8>, boolean: bool) {
    v.push(1);
    v.push(boolean as u8);
}

fn encode_amf_string(v: &mut Vec<u8>, mut string: String) {
    v.push(2);
    v.extend_from_slice(&(string.len() as u16).to_be_bytes());
    v.append(string.as_mut_vec());
}

fn encode_amf_object(v: &mut Vec<u8>, object: HashMap<String, AmfData>) {
    v.push(3);

    for (mut name, value) in object {
        v.extend_from_slice(&(name.len() as u16).to_be_bytes());
        v.append(name.as_mut_vec());
        encode_amf_data(v, value);
    }

    v.extend_from_slice(&[0, 0, 9]);
}

fn encode_amf_null(v: &mut Vec<u8>) {
    v.push(5);
}

fn encode_amf_data(v: &mut Vec<u8>, data: AmfData) {
    match data {
        AmfData::Number(number) => encode_amf_number(v, number),
        AmfData::Boolean(boolean) => encode_amf_boolean(v, boolean),
        AmfData::String(string) => encode_amf_string(v, string),
        AmfData::Object(object) => encode_amf_object(v, object),
        AmfData::Null => encode_amf_null(v),
        // まだ上記以外の AMF 型のデータを特定できていないため, 現段階では無視することとする.
        _ => {}
    }
}

fn encode_connect(v: &mut Vec<u8>, connect_command: ConnectCommand) {
    match connect_command {
        Connect::Response {
            transaction_id,
            properties,
            information
        } => {
            encode_amf_string(v, "_result".to_string());
            encode_amf_number(v, transaction_id);
            encode_amf_object(v, properties);
            encode_amf_object(v, information);
        },
        _ => {}
    }
}

fn encode_release_stream(v: &mut Vec<u8>, release_stream_command: ReleaseStreamCommand) {
    match release_stream_command {
        ReleaseStreamCommand::Response {
            transaction_id
        } => {
            encode_amf_string(v, "_result".to_string());
            encode_amf_number(v, transaction_id);
            encode_amf_null(v);
        },
        _ => {}
    }
}

fn encode_create_stream(v: &mut Vec<u8>, create_stream_command: CreateStreamCommand) {
    match create_stream_command {
        CreateStreamCommand::Response {
            transaction_id,
            message_id
        } => {
            encode_amf_string(v, "_result".to_string);
            encode_amf_number(v, transaction_id);
            encode_amf_null(v);
            encode_amf_number(v, message_id);
        },
        _ => {}
    }
}

fn encode_net_connection(v: &mut Vec<u8>, net_connection_command: NetConnectionCommand) {
    match net_connection_command {
        Connect(connect_command) => encode_connect(v, connect_command),
        ReleaseStream(release_stream_command) => encode_release_stream(v, release_stream_command),
        CreateStream(create_stream_command) => encode_create_stream(v, create_stream_command)
    }
}

fn encode_fc_publish(v: &mut Vec<u8>, fc_publish_command: FCPublishCommand) {
    match fc_publish_command {
        FCPublishCommand::Response => encode_amf_string(v, "onFCPublish".to_string()),
        _ => {}
    }
}

fn encode_publish(v: &mut Vec<u8>, publish_command: PublishCommand) {
    match publish_command {
        PublishCommand::Response {
            transaction_id,
            information
        } => {
            encode_amf_string(v, "onStatus".to_string());
            encode_amf_number(v, transaction_id);
            encode_amf_null(v);
            encode_amf_object(v, information);
        },
        _ => {}
    }
}

fn encode_net_stream(v: &mut Vec<u8>, net_stream_command: NetStreamCommand) {
    match net_stream_command {
        NetStreamCommand::Publish(publish_command) => encode_publish(v, publish_command)
    }
}

fn encode_invoke(v: &mut Vec<u8>, invoke_command: InvokeCommand) {
    match invoke_command {
        InvokeCommand::NetConnection(net_connection_command) => encode_net_connection(v, net_connection_command),
        InvokeCommand::NetStream(net_stream_command) => encode_net_stream(v, net_stream_command),
        InvokeCommand::FCPublish(fc_publish_command) => encode_fc_publish(v, fc_publish_command)
    }
}

fn encode_data(v: &mut Vec<u8>, data: Data) {
    match data {
        Data::ChunkSize(chunk_size) => encode_chunk_size(v, chunk_size),
        Data::Ping(ping_type, ping_data) => encode_ping(v, ping_type, ping_data),
        Data::ServerBandwidth(server_bandwidth) => encode_server_bandwidth(v, server_bandwidth),
        Data::ClientBandwidth(client_bandwidth, limit) => encode_client_bandwidth(v, client_bandwidth, limit),
        Data::Invoke(invoke_command) => encode_invoke(v, invoke_command)
    }
}

fn encode_chunk(v: &mut Vec<u8>, chunk: Chunk) {
    let mut data_bytes: Vec<u8> = Vec::new();

    encode_data(&mut data_bytes, chunk.get_data().clone());

    let message_length = if let Some(message_length) = chunk.get_message_header().get_message_length() {
        message_length
    } else {
        data_bytes.len() as u32
    };
    let splits = if message_length <= DEFAULT_CHUNK_SIZE {
        0
    } else {
        message_length / DEFAULT_CHUNK_SIZE + (message_length % DEFAULT_CHUNK != 0) as u32
    };

    if splits > 0 {
        let mut added: Vec<u8> = Vec::new();
        let basic_header = BasicHeader {
            message_header_format: 3,
            chunk_id: chunk.get_basic_header().get_chunk_id()
        };

        for i in 0..splits {
            if i > 0 {
                encode_basic_header(&mut added, basic_header);
            }

            let start = (DEFAULT_CHUNK_SIZE * i) as usize;
            let end = start + min(DEFAULT_CHUNK_SIZE, data_bytes[start..].len());

            added.extend_from_slice(&data_bytes[start..end]);
        }

        data_bytes = added;
    }

    encode_basic_header(v, chunk.get_basic_header());
    encode_message_header(
        v,
        MessageHeader {
            message_length,
            ..chunk.get_message_header()
        }
    );
    encode_extended_timestamp(v, chunk.get_extended_timestamp());
    v.append(&mut data_bytes);
}

fn send_chunk(stream: &mut TcpStream, chunk_id: u16, mut timestamp: u32, message_length: u32, message_type: u8, message_id: u32, data: Data, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let mut last_message_header = if let Some(ref mut last_message_header) = last_sent_chunks.get_mut(&chunk_id) {
        *last_message_header
    } else {
        MessageHeader {
            timestamp: None,
            message_length: None,
            message_type: None,
            message_id: None
        }
    };
    let last_timestamp = last_message_header.get_timestamp().unwrap_or_default();
    let last_message_length = last_message_header.get_message_length().unwrap_or_default();
    let last_message_type = last_message_header.get_message_type().unwrap_or_default();
    let last_message_id = last_message_header.get_message_id().unwrap_or_default();
    let message_header_format: u8 = if message_id == last_message_id {
        if message_length == last_message_length && message_type == last_message_type {
            if timestamp == last_timestamp {
                3
            } else {
                2
            }
        } else {
            1
        }
    } else {
        0
    };
    let basic_header = BasicHeader {
        message_header_format,
        chunk_id
    };
    let extended_timestamp = if timestamp >= 0x00ffffff as u32 {
        let extended_timestamp = Some(timestamp);

        timestamp = 0x00ffffff;
        extended_timestamp
    } else {
        None
    };
    let message_header = match message_header_format {
        0 => MessageHeader {
            timestamp,
            message_length,
            message_type,
            message_id
        },
        1 => MessageHeader {
            timestamp,
            message_length,
            message_type,
            message_id: None
        },
        2 => MessageHeader {
            timestamp,
            message_length: None,
            message_type: None,
            message_id: None
        },
        3 => MessageHeader {
            timestamp: None,
            message_length: None,
            message_type: None,
            message_id: None
        },
        n => panic!("what's this!?: {}", n)
    };
    let chunk = Chunk {
        basic_header,
        message_header,
        extended_timestamp,
        data
    };
    let mut v: Vec<u8> = Vec::new();

    encode_chunk(&mut v, chunk);
    stream.write(v.as_slice()).map(|_| ())
}

/* 送信時のタイムスタンプやメッセージストリーム ID の実際の渡し方については後述する. */

fn send_chunk_size(stream: &mut TcpStream, chunk_size: u32, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    if chunk_size < 1 || chunk_size > 0x7fffffff {
        return Err(ErrorKind::InvalidData.into());
    }

    send_chunk(stream, 2, 0, 4, 1, 0, Data::ChunkSize(chunk_size), last_sent_chunks)
}

fn send_stream_begin(stream: &mut TcpStream, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    send_chunk(stream, 2, 0, 6, 4, 0, Data::Ping(1, PingData::StreamBegin(0)), last_sent_chunks)
}

fn send_ping(stream: &mut TcpStream, ping_type: u16, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    match ping_type {
        1 => send_stream_begin(stream, last_sent_chunks),
        n => panic!("what's this!?: {}", n)
    }
}

fn send_server_bandwidth(stream: &mut TcpStream, server_bandwidth: u32, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    send_chunk(2, 0, 4, 5, 0, Data::ServerBandwidth(server_bandwidth), last_sent_chunks)
}

fn send_client_bandwidth(stream: &mut TcpStream, client_bandwidth: u32, limit: u8, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    send_chunk(2, 0, 5, 6, 0, Data::ClientBandwidth(client_bandwidth, limit), last_sent_chunks)
}

fn send_invoke(stream: &mut TcpStream, invoke_command: InvokeCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let mut v: Vec<u8> = Vec::new();

    encode_data(&mut v, Data::Invoke(invoke_command.clone()));
    send_chunk(3, 0, v.len(), 20, 0, Data::Invoke(invoke_command), last_sent_chunks)
}

fn send_connect_response(stream: &mut TcpStream, connect_command: ConnectCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let transaction_id = connect_command.get_received_transaction_id().unwrap();
    let mut properties: HashMap<String, AmfData> = HashMap::new();
    let mut information: HashMap<String, AmfData> = HashMap::new();

    properties.insert("fmsVer".to_string(), AmfData::String("FMS/3,0,1,123".to_string()));
    properties.insert("capabilities".to_string(), AmfData::Number(31 as f64));
    information.insert("level".to_string(), AmfData::String("status".to_string()));
    information.insert("code".to_string(), AmfData::String("NetConnection.Connect.Success".to_string()));
    information.insert("description".to_string(), AmfData::String("Connection succeeded.".to_string()));
    information.insert("objectEncoding".to_string(), AmfData::Number(0 as f64));

    let invoke = Data::Invoke(
        InvokeCommand::NetConnection(
            NetConnectionCommand::Connect(
                ConnectCommand::Response {
                    transaction_id,
                    properties,
                    information
                }
            )
        )
    );

    send_invoke(stream, invoke.clone(), last_sent_chunks)?;
    send_server_bandwidth(stream, DEFAULT_BANDWIDTH, last_sent_chunks)?;
    send_client_bandwidth(stream, DEFAULT_BANDWIDTH, last_sent_chunks)?;
    send_ping(stream, 1, last_sent_chunks)?;
    send_chunk_size(stream, DEFAULT_CHUNK_SIZE, last_sent_chunks)?;
    send_invoke(stream, invoke, last_sent_chunks)
}

fn send_release_stream_response(stream: &mut TcpStream, release_stream_command: ReleaseStreamCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let transaction_id = release_stream_command.get_received_trnasaction_id().unwrap();
    let invoke = Data::Invoke(
        InvokeCommand::NetConnection(
            NetConnectionCommand::ReleaseStream(
                ReleaseStreamCommand::Response {
                    transaction_id
                }
            )
        )
    );

    send_invoke(stream, invoke, last_sent_chunks)
}

fn send_create_stream_response(stream: &mut TcpStream, create_stream_command: CreateStreamCommand, message_id: f64, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let transaction_id = create_stream_command.get_received_transaction_id().unwrap();
    let invoke = Data::Invoke(
        InvokeCommand::NetConnection(
            NetConnectionCommand::CreateStream(
                CreateStreamCommand::Response {
                    transaction_id,
                    message_id
                }
            )
        )
    );

    send_invoke(stream, invoke, last_sent_chunks)
}

fn send_net_connection_response(stream: &mut TcpStream, net_connection_command: NetConnectionCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    match net_connection_command {
        NetConnectionCommand::Connect(connect_command) => send_connect_response(stream, connect_command, last_sent_chunks),
        NetConnectionCommand::ReleaseStream(release_stream_command) => send_release_stream_response(stream, release_stream_command, last_sent_chunks),
        NetConnectionCommand::CreateStream(create_stream_command) => send_create_stream_command(stream, create_stream_command, last_sent_chunks)
    }
}

fn send_fc_publish_response(stream: &mut TcpStream, fc_publish_command: FCPublishCommand) -> IOResult<()> {
    let transaction_id = fc_publish_command.get_received_transaction_id().unwrap();
    let invoke = Data::Invoke(
        InvokeCommand::FCPublish(
            FCPublishCommand::Response
        )
    );

    send_invoke(stream, invoke, last_sent_chunks)
}

fn send_publish_response(stream: &mut TcpStream, publish_command: PublishCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    let transaction_id = publish_command.get_received_transaction_id().unwrap();
    let publishing_name = publish_command.get_received_publishing_name().unwrap();
    let mut information: HashMap<String, AmfData> = HashMap::new();

    information.insert("level".to_string(), AmfData::String("status".to_string()));
    information.insert("code".to_string(), AmfData::String("NetStream.Publish.Start".to_string()));
    information.insert("description".to_string(), AmfData::String(format!("{} is now published", publishing_name)));
    information.insert("details".to_string(), AmfData::String(publishing_name));

    let invoke = Data::Invoke(
        InvokeCommand::NetStream(
            NetStreamCommand::Publish(
                PublishCommand::Response {
                    transaction_id,
                    information
                }
            )
        )
    );

    send_invoke(stream, invoke, last_sent_chunks)
}

fn send_net_stream_response(stream: &mut TcpStream, net_stream_command: NetStreamCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    match net_stream_command {
        NetStreamCommand::Publish(publish_command) => send_publish_response(stream, publish_command, last_sent_chunks)
    }
}

fn send_invoke_response(stream: &mut TcpStream, invoke_command: InvokeCommand, last_sent_chunks: &mut HashMap<u16, MessageHeader>) -> IOResult<()> {
    match invoke_command {
        InvokeCommand::NetConnection(net_connection_command) => send_net_connection_response(stream, net_connection_command, last_sent_chunks),
        InvokeCommand::NetStream(net_stream_command) => send_net_stream_response(stream, net_stream_command, last_sent_chunks),
        InvokeCommand::FCPublish(fc_publish_command) => send_fc_publish_response(stream, fc_publish, last_sent_chunks)
    }
}

fn main() -> IOResult<()> {
    let listener: TcpListener::bind("127.0.0.1:1935")?;
    let mut last_received_chunks: HashMap<u16, MessageHeader> = HashMap::new();
    let mut last_sent_chunks: HashMap<u16, MessageHeader> = HashMap::new();

    for incoming in listener.incoming() {
        let mut stream = incoming?;

        /* connect コマンドへの返送までは完了しているとみなす. */

        loop {
            let received_chunk = receive_chunk(&mut stream, &mut last_received_chunks)?;

            match received_chunk.get_data().clone() {
                Data::Invoke(invoke_command) => send_invoke_response(&mut stream, invoke_command, &mut last_sent_chunks)?,
                _ => {}
            }
        }
    }
}
```

上記の実装でエラーが発生しなければ, RTMP における基本的な接続処理はすべて完了である.

## まとめ

最後に, ハンドシェイクとチャンクの送受信処理を以下に一つにまとめておく.

!!!include(handshake-and-connection.md)!!!

次回は Notify チャンクを処理する方法と, Audio/Video チャンクをデコードする方法について記していく.

## 参考文献

[^RTMP-Specification-1.0]: Adobe Systems Inc., "RTMP Specification 1.0", http://wwwimages.adobe.com/content/dam/Adobe/en/devnet/rtmp/pdf/rtmp_specification_1.0.pdf

[前頁]: https://t-matsudate.github.io/rtmp-reports/overview
