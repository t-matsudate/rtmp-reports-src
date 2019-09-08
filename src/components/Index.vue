<template>
  <article id="index">
    <h2>目次</h2>
    <ol>
      <li>
        <h3><router-link to="/overview">RTMP の概要</router-link></h3>
        <p>投稿日: <time datetime="2019-09-08">2019-09-08</time></p>
        <p>記載内容：</p>
        <ul>
          <li>RTMPとは何か.</li>
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

        h2 {
          font-family: sans-serif;
          font-size: 150%;
          font-weight: normal;
          font-style: normal;
          text-align: center;
          padding: 1em;
        }

        ol {
          margin: 1em;

          li {
            h3 {
              font-size: 125%;
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
