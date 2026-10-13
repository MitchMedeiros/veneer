<script setup lang="ts">
import { ref, computed } from 'vue'

const count = ref(0)
const doubled = computed(() => count.value * 2)

function increment(): void {
  count.value++
}
</script>

<template>
  <div class="counter" :class="{ big: count > 5 }">
    <h1>{{ doubled }}</h1>
    <button @click="increment">Add</button>
    <p v-if="count > 0">Positive</p>
  </div>
</template>

<style scoped>
.counter {
  color: #333;
}
</style>
