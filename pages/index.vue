<template>
  <article id="index">
    <Author :author="author" :published="firstPublished" :modified="lastModified" />
    <ReportTitle :report-title="title" />
    <ol>
      <li>
        <h2><nuxt-link to="/articles/overview">RTMP の概要</nuxt-link></h2>
        <ul class="datetime">
          <li class="modified">更新日: <time :datetime="modified.overview">{{ modified.overview }}</time></li>
          <li class="published">投稿日: <time :datetime="published.overview">{{ published.overview }}</time></li>
        </ul>
        <p>記載内容：</p>
        <ul class="contents">
          <li>RTMP とは何か.</li>
          <li>基本的な通信手順について.</li>
          <li>既存製品はどのように通信しているか.</li>
          <li>私達はそれらの製品とどのように通信していけばよいか.</li>
        </ul>
      </li>
      <li>
        <h2><nuxt-link to="/articles/connection-implementation">ハンドシェイクと Invoke 処理の実装</nuxt-link></h2>
        <ul class="datetime">
          <li class="modified">更新日: <time :datetime="modified.connectionImplementation">{{ modified.connectionImplementation }}</time></li>
          <li class="published">投稿日: <time :datetime="published.connectionImplementation">{{ published.connectionImplementation }}</time></li>
        </ul>
        <p>記載内容：</p>
        <ul class="contents">
          <li>RTMP ハンドシェイクの実装.</li>
          <li>connect 呼び出しの処理方法について.</li>
          <li>releaseStream, onFCPublish および createStream 呼び出しの処理方法について.</li>
          <li>publish 呼び出しの処理方法について.</li>
        </ul>
      </li>
    </ol>
    <ShareButtons :text="title" :path="$route.path" />
  </article>
</template>

<script>
import Author from '@/components/Author.vue'
import ReportTitle from '@/components/ReportTitle.vue'
import ShareButtons from '@/components/ShareButtons.vue'

export default {
  components: {
    Author,
    ReportTitle,
    ShareButtons
  },
  data() {
    return {
      title: 'RTMP Implementation Reports',
      description: 'RTMP サーバの実装メモと直近の仕様の整理.',
      author: 'T.Matsudate',
      published: {
        overview: '2019-09-09',
        connectionImplementation: '2020-02-13'
      },
      modified: {
        overview: '2020-01-04',
        connectionImplementation: '2020-02-16',
      },
    }
  },
  computed: {
    firstPublished() {
      return Object.values(this.published).reduce((acc, val) => new Date(acc) < new Date(val) ? acc : val)
    },
    lastModified() {
      return Object.values(this.published).concat(Object.values(this.modified)).reduce((acc, val) => new Date(acc) > new Date(val) ? acc : val)
    },
  },
  head() {
    return {
      title: this.title,
      meta: [
        { hid: 'description',
          name: 'description',
          content: this.description },
        { hid: 'title',
          property: 'og:title',
          content: this.title },
        { hid: 'type',
          property: 'og:type',
          content: 'website' },
        { hid: 'url',
          property: 'og:url',
          content: 'https://t-matsudate.github.io/rtmp-reports/' },
        { hid: 'og:description',
          property: 'og:description',
          content: this.description }
      ]
    }
  }
}
</script>

<style lang="less">
@import "~assets/less/index";
</style>
