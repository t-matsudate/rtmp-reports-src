<template>
  <h1 id="report-title">{{ reportTitle }}</h1>
</template>

<script>
export default {
  props: {
    reportTitle: {
      type: String,
      required: true
    }
  }
}
</script>

<style lang="less">
@import "~assets/less/title";
</style>
