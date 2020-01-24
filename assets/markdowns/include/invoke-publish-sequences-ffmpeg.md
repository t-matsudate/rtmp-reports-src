@startuml
== Invoke(createStream) への応答が完了した. ==
クライアント -> サーバ: Invoke(publish)
サーバ -> クライアント: User Control(Stream Begin)
サーバ -> クライアント: Invoke(onStatus)
== 映像/音声の送受信を開始する. ==
クライアント -> サーバ ++ : Metadata
クライアント -> サーバ: Audio
クライアント -> サーバ: Video
== 映像/音声の送信が完了するまで. ==
@enduml

