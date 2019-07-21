<template>
  <div id="main">
    <main>
      <Article />
    </main>
  </div>
</template>

<script>
import Article from './Article.vue';

export default {
  name: 'Main',
  components: {
    Article
  }
};
</script>

<style lang="less">
#grids {
    #main {
        z-index: 0;
        margin-top: 3em;
        grid-row: 2;

        main {
            padding: 2em 1em 1em 1em;
        }
    }
}
</style>
