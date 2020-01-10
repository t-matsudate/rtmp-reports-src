<template>
  <p id="author">
    {{ author }}
    <ul class="datetime">
      <li class="modified" v-if="modified">更新日: <time :datetime="modified">{{ modified }}</time></li>
      <li class="published">投稿日: <time :datetime="published">{{ published }}</time></li>
    </ul>
  </p>
</template>

<script>
export default {
  props: {
    author: {
      type: String,
      required: true
    },
    published: {
      type: String,
      required: true,
      validator: (published) => !isNaN(new Date(published))
    },
    modified: {
      type: String,
      validator: (modified) => !isNaN(new Date(modified))
    },
  }
}
</script>

<style lang="less">
@import "~assets/less/author";
</style>
