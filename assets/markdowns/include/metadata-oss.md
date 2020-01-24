FFmpeg/rtmpproto.c#L2347-L2395[^FFmpeg/rtmpproto.c#L2347-L2395]

```c
static int handle_metadata(RTMPContext *rt, RTMPPacket *pkt)
{
    int ret, old_flv_size, type;
    const uint8_t *next;
    uint8_t *p;
    uint32_t size;
    uint32_t ts, cts, pts = 0;

    old_flv_size = update_offset(rt, pkt->size);

    if ((ret = av_reallocp(&rt->flv_data, rt->flv_size)) < 0) {
        rt->flv_size = rt->flv_off = 0;
        return ret;
    }

    next = pkt->data;
    p    = rt->flv_data + old_flv_size;

    /* copy data while rewriting timestamps */
    ts = pkt->timestamp;

    while (next - pkt->data < pkt->size - RTMP_HEADER) {
        type = bytestream_get_byte(&next);
        size = bytestream_get_be24(&next);
        cts  = bytestream_get_be24(&next);
        cts |= bytestream_get_byte(&next) << 24;
        if (!pts)
            pts = cts;
        ts += cts - pts;
        pts = cts;
        if (size + 3 + 4 > pkt->data + pkt->size - next)
            break;
        bytestream_put_byte(&p, type);
        bytestream_put_be24(&p, size);
        bytestream_put_be24(&p, ts);
        bytestream_put_byte(&p, ts >> 24);
        memcpy(p, next, size + 3 + 4);
        p    += size + 3;
        bytestream_put_be32(&p, size + RTMP_HEADER);
        next += size + 3 + 4;
    }
    if (p != rt->flv_data + rt->flv_size) {
        av_log(NULL, AV_LOG_WARNING, "Incomplete flv packets in "
                                     "RTMP_PT_METADATA packet\n");
        rt->flv_size = p - rt->flv_data;
    }

    return 0;
}
```

obs-studio/rtmp.c#L1490-L1523[^obs-studio/rtmp.c#L1490-L1523]
obs-studio/rtmp.c#L4972-L5059[^obs-studio/rtmp.c#L4972-L5059]

```c
case RTMP_PACKET_TYPE_FLASH_VIDEO:
{
    /* go through FLV packets and handle metadata packets */
    unsigned int pos = 0;
    uint32_t nTimeStamp = packet->m_nTimeStamp;

    while (pos + 11 < packet->m_nBodySize)
    {
        uint32_t dataSize = AMF_DecodeInt24(packet->m_body + pos + 1);	/* size without header (11) and prevTagSize (4) */

        if (pos + 11 + dataSize + 4 > packet->m_nBodySize)
        {
            RTMP_Log(RTMP_LOGWARNING, "Stream corrupt?!");
            break;
        }
        if (packet->m_body[pos] == 0x12)
        {
            HandleMetadata(r, packet->m_body + pos + 11, dataSize);
        }
        else if (packet->m_body[pos] == 8 || packet->m_body[pos] == 9)
        {
            nTimeStamp = AMF_DecodeInt24(packet->m_body + pos + 4);
            nTimeStamp |= (packet->m_body[pos + 7] << 24);
        }
        pos += (11 + dataSize + 4);
    }
    if (!r->m_pausing)
        r->m_mediaStamp = nTimeStamp;

    /* FLV tag(s) */
    /*RTMP_Log(RTMP_LOGDEBUG, "%s, received: FLV tag(s) %lu bytes", __FUNCTION__, packet.m_nBodySize); */
    bHasMediaPacket = 1;
    break;
}

// 中略

if (packet.m_packetType == RTMP_PACKET_TYPE_FLASH_VIDEO)
{
    /* basically we have to find the keyframe with the
     * correct TS being nResumeTS
     */
    unsigned int pos = 0;
    uint32_t ts = 0;

    while (pos + 11 < nPacketLen)
    {
        /* size without header (11) and prevTagSize (4) */
        uint32_t dataSize =
            AMF_DecodeInt24(packetBody + pos + 1);
        ts = AMF_DecodeInt24(packetBody + pos + 4);
        ts |= (packetBody[pos + 7] << 24);

#ifdef _DEBUG
        RTMP_Log(RTMP_LOGDEBUG,
                 "keyframe search: FLV Packet: type %02X, dataSize: %d, timeStamp: %d ms",
                 packetBody[pos], dataSize, ts);
#endif
        /* ok, is it a keyframe?:
         * well doesn't work for audio!
         */
        if (packetBody[pos /*6928, test 0 */ ] ==
                r->m_read.initialFrameType
                /* && (packetBody[11]&0xf0) == 0x10 */ )
        {
            if (ts == r->m_read.nResumeTS)
            {
                RTMP_Log(RTMP_LOGDEBUG,
                         "Found keyframe with resume-keyframe timestamp!");
                if (r->m_read.nInitialFrameSize != dataSize
                        || memcmp(r->m_read.initialFrame,
                                  packetBody + pos + 11,
                                  r->m_read.
                                  nInitialFrameSize) != 0)
                {
                    RTMP_Log(RTMP_LOGERROR,
                             "FLV Stream: Keyframe doesn't match!");
                    ret = RTMP_READ_ERROR;
                    break;
                }
                r->m_read.flags |= RTMP_READ_GOTFLVK;

                /* skip this packet?
                 * check whether skippable:
                 */
                if (pos + 11 + dataSize + 4 > nPacketLen)
                {
                    RTMP_Log(RTMP_LOGWARNING,
                             "Non skipable packet since it doesn't end with chunk, stream corrupt!");
                    ret = RTMP_READ_ERROR;
                    break;
                }
                packetBody += (pos + 11 + dataSize + 4);
                nPacketLen -= (pos + 11 + dataSize + 4);

                goto stopKeyframeSearch;

            }
            else if (r->m_read.nResumeTS < ts)
            {
                /* the timestamp ts will only increase with
                 * further packets, wait for seek
                 */
                goto stopKeyframeSearch;
            }
        }
        pos += (11 + dataSize + 4);
    }
    if (ts < r->m_read.nResumeTS)
    {
        RTMP_Log(RTMP_LOGERROR,
                 "First packet does not contain keyframe, all "
                 "timestamps are smaller than the keyframe "
                 "timestamp; probably the resume seek failed?");
    }
stopKeyframeSearch:
    ;
    if (!(r->m_read.flags & RTMP_READ_GOTFLVK))
    {
        RTMP_Log(RTMP_LOGERROR,
                 "Couldn't find the seeked keyframe in this chunk!");
        ret = RTMP_READ_IGNORE;
        break;
    }
}
```

red5-server-common/Aggregate.java#L108-L198[^red5-server-common/Aggregate.java#L108-L198]

```java
/**
 * Breaks-up the aggregate into its individual parts and returns them as a list. The parts are returned based on the ordering of the aggregate itself.
 * 
 * @return list of IRTMPEvent objects
 */
public LinkedList<IRTMPEvent> getParts() {
    LinkedList<IRTMPEvent> parts = new LinkedList<IRTMPEvent>();
    log.trace("Aggregate data length: {}", data.limit());
    int position = data.position();
    do {
        try {
            // read the header
            //log.trace("Hex: {}", data.getHexDump());
            byte subType = data.get();
            // when we run into subtype 0 break out of here
            if (subType == 0) {
                log.debug("Subtype 0 encountered within this aggregate, processing with exit");
                break;
            }
            int size = IOUtils.readUnsignedMediumInt(data);
            log.debug("Data subtype: {} size: {}", subType, size);
            // TODO ensure the data contains all the bytes to support the specified size
            int timestamp = IOUtils.readExtendedMediumInt(data);
            /*timestamp = ntohap((GETIBPOINTER(buffer) + 4)); 0x12345678 == 34 56 78 12*/
            int streamId = IOUtils.readUnsignedMediumInt(data);
            log.debug("Data timestamp: {} stream id: {}", timestamp, streamId);
            Header partHeader = new Header();
            partHeader.setChannelId(header.getChannelId());
            partHeader.setDataType(subType);
            partHeader.setSize(size);
            // use the stream id from the aggregate's header
            partHeader.setStreamId(header.getStreamId());
            partHeader.setTimer(timestamp);
            // timer delta == time stamp - timer base
            // the back pointer may be used to verify the size of the individual part
            // it will be equal to the data size + header size
            int backPointer = 0;
            switch (subType) {
                case TYPE_AUDIO_DATA:
                    AudioData audio = new AudioData(data.getSlice(size));
                    audio.setTimestamp(timestamp);
                    audio.setHeader(partHeader);
                    log.debug("Audio header: {}", audio.getHeader());
                    parts.add(audio);
                    //log.trace("Hex: {}", data.getHexDump());
                    // ensure 4 bytes left to read an int
                    if (data.position() < data.limit() - 4) {
                        backPointer = data.getInt();
                        //log.trace("Back pointer: {}", backPointer);
                        if (backPointer != (size + 11)) {
                            log.debug("Data size ({}) and back pointer ({}) did not match", size, backPointer);
                        }
                    }
                    break;
                case TYPE_VIDEO_DATA:
                    VideoData video = new VideoData(data.getSlice(size));
                    video.setTimestamp(timestamp);
                    video.setHeader(partHeader);
                    log.debug("Video header: {}", video.getHeader());
                    parts.add(video);
                    //log.trace("Hex: {}", data.getHexDump());
                    // ensure 4 bytes left to read an int
                    if (data.position() < data.limit() - 4) {
                        backPointer = data.getInt();
                        //log.trace("Back pointer: {}", backPointer);
                        if (backPointer != (size + 11)) {
                            log.debug("Data size ({}) and back pointer ({}) did not match", size, backPointer);
                        }
                    }
                    break;
                default:
                    log.debug("Non-A/V subtype: {}", subType);
                    Unknown unk = new Unknown(subType, data.getSlice(size));
                    unk.setTimestamp(timestamp);
                    unk.setHeader(partHeader);
                    parts.add(unk);
                    // ensure 4 bytes left to read an int
                    if (data.position() < data.limit() - 4) {
                        backPointer = data.getInt();
                    }
            }
            position = data.position();
        } catch (Exception e) {
            log.error("Exception decoding aggregate parts", e);
            break;
        }
        log.trace("Data position: {}", position);
    } while (position < data.limit());
    log.trace("Aggregate processing complete, {} parts extracted", parts.size());
    return parts;
}
```

上記の各実装において, `type/subType`, `size/dataSize` および `cts/nTimestamp/timestamp` として表れているフィールドは公式ドキュメント[^RTMP-Specification-1.0]中の以下の部分で定義されている.

> 6.1.1.  Message Header
>
> The message header contains the following:
>
> Message Type: One byte field to represent the message type. A range of type IDs (1-6) are reserved for protocol control messages.  
> Length: Three-byte field that represents the size of the payload in bytes. It is set in big-endian format.  
> Timestamp: Four-byte field that contains a timestamp of the message. The 4 bytes are packed in the big-endian order.  
> Message Stream Id: Three-byte field that identifies the stream of the message. These bytes are set in big-endian format.

1. メッセージの種類 (ID, 1 byte)

* 1 - 6 はプロトコル制御メッセージ用に予約されている.

2. 長さ(3 bytes)

* Big Endianである.

3. タイムスタンプ (4 bytes)

* Big Endianである. と書かれているが, 上記の各実装では以下のデコードを行っている:
  * チャンク中の最下位の 1 byte を実際のタイムスタンプの最上位 1 byte とする.
  * 実際のタイムスタンプからチャンクにエンコードする場合は, 上記の逆の操作を行う.

4. メッセージストリーム ID (3 bytes)

* Big Endian である.

メッセージストリーム ID について:

> The message stream ID of the aggregate message overrides the message stream IDs of the sub-messages inside the aggregate.

* 集約メッセージのチャンクに割り当てられているメッセージストリーム ID はサブメッセージに割り当てられているメッセージストリーム ID を無視する.

タイムスタンプについて:

> The difference between the timestamps of the aggregate message and the first sub-message is the offset used to renormalize the timestamps of the sub-messages to the stream timescale.
> The offset is added to each sub-message’s timestamp to arrive at the normalized stream time.
> The timestamp of the first sub-message SHOULD be the same as the timestamp of the aggregate message, so the offset SHOULD be zero.

* サブメッセージのタイムスタンプはチャンクメッセージヘッダに入力されたタイムスタンプを基準にしたオフセットである.
* チャンクメッセージヘッダのタイムスタンプに当該フィールドの値を加算することで実際のタイムスタンプを求めることができる.
* 最初のサブメッセージのタイムスタンプはチャンクメッセージヘッダのそれと同一で**あるべき**なので, オフセットは 0 で**あるべき**である.

そして, バックポインタについては公式ドキュメント[^RTMP-Specification-1.0]では以下のように定義されている.

> The back pointer contains the size of the previous message including its header.
> It is included to match the format of FLV file and is used for backward seek.

* サブヘッダを含む直前のサブメッセージのサイズである.
* FLV ファイルのフォーマットに一致しており, 逆シークに使われる.

当該サブヘッダに入力するメッセージの種類は上記の各実装を参考にすると以下のようである.

Audio:

* メッセージ種類 ID: 8
* 入力内容:
  * 音声データ.
  * 生のバイト列である.

Video:

* メッセージ種類 ID: 9
* 入力内容:
  * 映像データ.
  * 以下同上.

Data(Official) / Notify(FFmpeg, Red5) / Info(OBS):

* メッセージ種類 ID: 18
* 入力内容:
  * サブメッセージのメタデータ.
  * AMF0 がサブメッセージに適用されている.

上記の FFmpeg および OBS の実装に着目すると, いずれもメッセージストリーム ID に相当するフィールドを意図的にデコードして**いない**ことを確認できる. 同様に, バックポインタの値もデコードして**いない**ことを確認できる.  
ところで, 上記ソースコード中に `1`, `3`, `4`, `7` および `11` といったマジックナンバーが散見される. これらは以下の計算に用いられている.

FFmpeg:

* 3: メッセージストリーム ID のサイズ. デコードはしないがそのままコピーして使い回すため, コピーするサイズをその分だけ加算している.
* 4: バックポインタのサイズ. 受信したチャンクに入力されている分に関してはデコードしないが, 送信するチャンクには入力が必須なため, サイズをその分だけ加算している.
* RTMP\_HEADER: 11. つまり Metadata チャンクに入力されているサブヘッダ全体のサイズである.

OBS:

* 1: サブメッセージの種類 (ID). OBS ではメッセージストリーム ID を読み飛ばしている箇所があるため, その分だけオフセットしている.
* 4: タイムスタンプの開始位置. サブメッセージの種類を表す ID (1 byte) と サブメッセージの長さ (3 bytes) を合計した分だけオフセットしている.
* 7: タイムスタンプの **4 bytes目**の位置. タイムスタンプの開始位置にタイムスタンプの上位 3 bytes のサイズをさらに合計した分だけオフセットしている.
* 11: Metadata チャンクに入力されているサブヘッダのサイズ.
