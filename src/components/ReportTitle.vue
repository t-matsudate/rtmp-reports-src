<template>
  <h2 id="report-title">{{ reportTitle }}</h2>
</template>

<script>
export default {
  name: 'ReportTitle',
  props: {
    reportTitle: {
      type: String,
      required: true
    }
  },
  mounted() {
    let head = document.getElementsByTagName('head')[0];
    let ogTitle = document.createElement('meta');
    let ogType = document.createElement('meta');
    let ogUrl = document.createElement('meta');

    document.title = this.reportTitle;
    ogTitle.setAttribute('property', 'og:title');
    ogTitle.setAttribute('content', this.reportTitle);
    ogType.setAttribute('property', 'og:type');
    ogType.setAttribute('content', 'article');
    ogUrl.setAttribute('property', 'og:url');
    ogUrl.setAttribute('content', 'https://t-matsudate.github.io/rtmp-reports.html');
    head.appendChild(ogTitle);
    head.appendChild(ogType);
    head.appendChild(ogUrl);
  }
}
</script>

<style lang="less">
#grids {
  #main {
    main {
      article {
        #report-title {
          padding: 1em;
          text-align: center;
          font-size: 200%;
          font-style: normal;
          font-weight: bold;
          font-family: sans-serif;
        }
      }
    }
  }
}
</style>
