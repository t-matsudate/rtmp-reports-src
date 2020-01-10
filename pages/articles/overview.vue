<template>
  <article id="report">
    <Author :author="author" :published="published" :modified="modified" />
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
import Overview from '@/assets/markdowns/overview.md'
import FlowChart from 'flowchart.js'
import RtmpConnectionFlows from '@/assets/flowcharts/rtmp-connection-flows.flow'

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
      published: '2019-09-09',
      modified: '2020-01-04',
      title: 'RTMP の概要',
      source: Overview
    }
  },
  mounted() {
    let rtmp_connection_flows = FlowChart.parse(RtmpConnectionFlows)

    rtmp_connection_flows.drawSVG('rtmp-connection-flows')
  },
  head() {
    return {
      title: this.title,
      meta: [
        { hid: 'description',
          name: 'description',
          content: 'RTMP とは何か. 基本的な通信手順は何か. 既存製品はどのように通信しているか. 私達はそれらの製品とどのように通信していけばよいか.' },
        { hid: 'title',
          property: 'og:title',
          content: this.title },
        { hid: 'og:description',
          property: 'og:description',
          content: 'RTMP とは何か. 基本的な通信手順は何か. 既存製品はどのように通信しているか. 私達はそれらの製品とどのように通信していけばよいか.' },
        { hid: 'type',
          property: 'og:type',
          content: 'article' },
        { hid: 'published_time',
          property: 'og:article:published_time',
          content: this.published },
        { hid: 'modified_time',
          property: 'og:article:modified_time',
          content: this.modified },
        { hid: 'section',
          property: 'og:article:section',
          content: 'Overview' },
        { hid: 'author',
          property: 'og:article:author',
          content: this.author },
        { hid: 'tag1',
          property: 'og:article:tag',
          content: 'RTMP' },
        { hid: 'tag2',
          property: 'og:article:tag',
          content: '実装' },
        { hid: 'tag3',
          property: 'og:article:tag',
          content: 'FFmpeg' },
        { hid: 'tag4',
          property: 'og:article:tag',
          content: 'Open Broadcaster Software' },
        { hid: 'tag5',
          property: 'og:article:tag',
          content: 'OBS' },
        { hid: 'tag6',
          property: 'og:article:tag',
          content: 'Red5' }
      ]
    }
  }
}
</script>

<style lang="less">
@import "~assets/less/overview";
</style>
