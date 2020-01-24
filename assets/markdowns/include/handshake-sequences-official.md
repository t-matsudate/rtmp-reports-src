@startuml
== 未初期化 ==
Client -> Network: C0
Network -> Server: C0
Client -> Network: C1
note left
    RTMP バージョンが
    送信された.
end note
Server -> Network: S0
Server -> Network: S1
note right
    RTMP バージョンが
    送信された.
end note
Network -> Client: S0
Network -> Client: S1
Network -> Server: C1
Client -> Network: C2
Server -> Network: S2
== 肯定応答が送信された. ==
Network -> Client: S2
Network -> Server: C2
== ハンドシェイクが完了した. ==
@enduml

