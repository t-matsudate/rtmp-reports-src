<template>
  <article id="index">
    <p id="published">T.Matsudate<br>投稿日: <time datetime="2019-09-09">2019-09-09</time></p>
    <h1>目次</h1>
    <ol>
      <li>
        <h2><a href="/rtmp-reports/overview">RTMP の概要</a></h2>
        <p>投稿日: <time datetime="2019-09-09">2019-09-09</time></p>
        <p>記載内容：</p>
        <ul>
          <li>RTMP とは何か.</li>
          <li>基本的な通信手順について.</li>
          <li>既存製品はどのように通信しているか.</li>
          <li>私達はそれらの製品とどのように通信していけばよいか.</li>
        </ul>
      </li>
    </ol>
  </article>
</template>

<script>
export default {
  name: 'Index'
}
</script>

<style lang="less">
#grids {
  #main {
    main {
      #index {
        font-family: serif;

        #published {
          padding: 1em;
          font-family: sans-serif;
          text-align: right;
        }

        h1 {
          padding: 1em;
          font-family: sans-serif;
          font-size: 200%;
          font-weight: bold;
          font-style: normal;
          text-align: center;
        }

        ol {
          margin: 1em;

          li {
            h2 {
              font-size: 150%;
              font-weight: normal;
              font-style: normal;

              a {
                text-decoration: none;

                &:hover {
                  text-decoration: underline;
                }
              }
            }

            ul {
              margin: 1em;
            }
          }
        }
      }
    }
  }
}
</style>
