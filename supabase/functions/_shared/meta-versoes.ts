// As versões da Meta moram num lugar só, src/lib/meta/versoes.ts (o botão
// "Conectar com a Meta" lê de lá). As edge functions importam por aqui.
// Arquivo puro dos dois lados: o Deno resolve o caminho relativo e o
// `supabase functions deploy` leva o arquivo junto.
export {
  META_GRAPH_VERSION,
  META_GRAPH_ROOT,
  INSTAGRAM_GRAPH_ROOT,
} from '../../../src/lib/meta/versoes.ts';
