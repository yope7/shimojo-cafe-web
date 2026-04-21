extern "C" {
unsigned int is_hit(unsigned int seed) {
  return (seed % 3u) == 0u ? 1u : 0u;
}
}
