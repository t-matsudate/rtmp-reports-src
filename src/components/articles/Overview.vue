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
import FlowChart from 'flowchart.js';
import RtmpConnectionFlows from '!!raw-loader!@/flowcharts/rtmp-connection-flows.flow';

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
  },
  mounted() {
    let rtmp_connection_flows = FlowChart.parse(RtmpConnectionFlows);

    rtmp_connection_flows.drawSVG('rtmp-connection-flows');
  }
};
</script>

<style lang="less">
#grids {
  #main {
    main {
      #report {
        .markdown-body {
          #rtmp-connection-flows {
            text-align: center;
          }

          #rtmp-handshake-sequences-official {
            text-align: center;
          }

          #rtmp-handshake-sequences-current {
            text-align: center;
          }

          #rtmp-application-connect-sequences {
            text-align: center;
          }

          #rtmp-invoke-connect-sequences-official {
            text-align: center;
          }

          #rtmp-invoke-connect-sequences-ffmpeg {
            text-align: center;
          }

          #rtmp-invoke-connect-sequences-fixed {
            text-align: center;
          }

          #rtmp-invoke-publish-sequences-official {
            text-align: center;
          }

          #rtmp-invoke-publish-sequences-ffmpeg {
            text-align: center;
          }
        }
      }
    }
  }
}
</style>
