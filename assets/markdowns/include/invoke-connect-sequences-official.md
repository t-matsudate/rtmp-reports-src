@startuml
== RTMP ハンドシェイクが完了した. ==
Client -> Server: Invoke(connect)
Server -> Client: Window Acknowledgement Size / Server BandWidth
Server -> Client: Set Peer BandWidth / Client BandWidth
Client -> Server: Window Acknowledgement Size / Server BandWidth
Server -> Client: User Control(Stream Begin)
Server -> Client: Invoke(_result)
@enduml

