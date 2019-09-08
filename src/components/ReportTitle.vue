<template>
  <h1 id="report-title">{{ reportTitle }}</h1>
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
    // Open Graphを挿入する.
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
    ogUrl.setAttribute('content', 'https://t-matsudate.github.io/rtmp-reports/');
    head.appendChild(ogTitle);
    head.appendChild(ogType);
    head.appendChild(ogUrl);

    // 現在見ているタイトルのメニューを太字にする.
    for (let menuItem of document.querySelectorAll('#menu-list nav ul li a')) {
      if (menuItem.innerHTML === this.reportTitle) {
        menuItem.id = 'current-article';
        break;
      }
    }
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
