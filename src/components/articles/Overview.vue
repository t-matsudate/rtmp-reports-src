<template>
  <Report>
    <Author #author :date="published" :author="author" />
    <ReportTitle #title :report-title="title" />
    <Markdown :source="source" />
  </Report>
</template>

<script>
import Report from '../Report.vue';
import Author from '../Author.vue';
import ReportTitle from '../ReportTitle.vue';
import Markdown from '../Markdown.vue';
import Overview from '!!raw-loader!@/markdowns/Overview.md';

export default {
  name: 'Overview',
  components: {
    Report,
    Author,
    ReportTitle,
    Markdown
  },
  data() {
    return {
      title: 'RTMPの概要',
      author: 'T.Matsudate',
      published: '2019-07-22',
      source: Overview
    };
  }
};
</script>

<style lang="less">
</style>
