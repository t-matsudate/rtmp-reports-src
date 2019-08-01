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
import NotFound from '!!raw-loader!@/markdowns/NotFound.md';

export default {
  name: 'NotFound',
  components: {
    Report,
    Author,
    ReportTitle,
    Markdown
  },
  data() {
    return {
      title: 'Report Not Found',
      author: '',
      published: '',
      source: NotFound
    };
  }
};
</script>

<style lang="less">
</style>
