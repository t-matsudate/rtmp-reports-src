1. コマンド名
   * AMF 型: String
   * 値: releaseStream
2. トランザクション ID
   * AMF 型: Number
   * 値: 2. Invoke(connect) に割り振られた値より 1 多い値を割り振るようだ.
3. Null
   * AMF 型: Null
   * 値: AMF における Null. コマンドオブジェクトなどを入力しない場合はトランザクション ID の直後にこの値を 1 つ入力するようだ.
4. **playpath**
   * AMF 型: String
   * 値: mp4やmp3などのファイル名. mp4: などのプリフィックスを付けることができる. 起動時に渡される URL から参照する. そのパターンは次の通りである: protocol://server[:port][/app][/playpath]
