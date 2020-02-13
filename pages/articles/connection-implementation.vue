<template>
  <article id="report">
    <Author :author="author" :published="published" />
    <ReportTitle :report-title="title" />
    <Markdown :source="source" />
    <ShareButtons :text="title" :path="$route.path" />
  </article>
</template>

<script>
import Author from '@/components/Author.vue'
import ReportTitle from '@/components/ReportTitle.vue'
import Markdown from '@/components/Markdown.vue'
import ShareButtons from '@/components/ShareButtons.vue'
import ConnectionImplementation from '@/assets/markdowns/connection-implementation.md'

export default {
  components: {
    Author,
    ReportTitle,
    Markdown,
    ShareButtons
  },
  data() {
    return {
      author: 'T.Matsudate',
      published: '2020-02-13',
      title: 'ハンドシェイクと Invoke 処理の実装',
      description: 'RTMP サーバをどのように実装していけばよいかについて, 接続開始から映像/音声の送受信直前までの実装で説明していく.',
      source: ConnectionImplementation
    }
  },
  head() {
    return {
      title: this.title,
      meta: [
        {
          hid: 'description',
          name: 'description',
          content: this.description
        },
        {
          hid: 'title',
          property: 'og:title',
          content: this.title
        },
        {
          hid: 'og:description',
          property: 'og:description',
          content: this.description
        },
        {
          hid: 'url',
          property: 'og:url',
          content: 'https://t-matsudate.github.io/rtmp-reports/articles/connection-implementation'
        },
        {
          hid: 'type',
          property: 'og:type',
          content: 'article'
        },
        {
          hid: 'published_time',
          property: 'og:article:published_time',
          content: this.published
        },
        {
          hid: 'section',
          property: 'og:article:section',
          content: 'Implementation'
        },
        {
          hid: 'author',
          property: 'og:article:author',
          content: this.author
        },
        {
          hid: 'tag1',
          property: 'og:article:tag',
          content: 'RTMP'
        },
        {
          hid: 'tag2',
          property: 'og:article:tag',
          content: '実装'
        },
        {
          hid: 'tag3',
          property: 'og:article:tag',
          content: 'Rust'
        }
      ]
    }
  }
}
</script>

<style lang="less">
@import "~assets/less/connection-implementation";
</style>
