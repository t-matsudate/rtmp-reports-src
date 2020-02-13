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
        let s1 = handle_first_handshake(&mut stream)?;

        handle_second_handshake(&mut stream, s1)?;

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

