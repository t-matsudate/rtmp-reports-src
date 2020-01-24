@startuml
== Invoke(createStream) への応答が完了した. ==
クライアント -> サーバ: Invoke(publish)
サーバ -> クライアント: User Control(Stream Begin)
クライアント -> サーバ: Metadata
クライアント -> サーバ: Audio
クライアント -> サーバ: Chunk Size
サーバ -> クライアント: Invoke(onStatus)
クライアント -> サーバ ++ : Video
== ストリームの送信が完了するまで. ==
@enduml

