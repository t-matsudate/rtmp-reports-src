<template>
  <div id="share-buttons">
    <a href="https://twitter.com/share?ref_src=twsrc%5Etfw" class="twitter-share-button" :data-text="text" :data-url="url" data-show-count="true">Tweet</a>
  </div>
</template>

<script>
export default {
  props: {
    text: {
      type: String,
      required: true
    },
    path: {
      type: String,
      required: true
    }
  },
  computed: {
    url() {
      return 'https://t-matsudate.github.io/rtmp-reports' + this.path
    }
  }
}
</script>
