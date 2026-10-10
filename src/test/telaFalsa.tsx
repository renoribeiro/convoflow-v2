import { useLocation, useParams } from 'react-router-dom';

/**
 * Tela de mentira para o teste da árvore de rotas (appRoutes.test.tsx).
 *
 * Mostra o nome da tela e o que o roteador entregou a ela: caminho, busca,
 * fragmento e parâmetros. É o que o teste confere — que cada endereço cai na
 * tela certa e que `?checkout=`, `#page:...` e afins chegam inteiros.
 */
export function telaFalsa(nome: string) {
  const Tela = () => {
    const local = useLocation();
    const params = useParams();
    return (
      <div>
        <h1>{`Tela ${nome}`}</h1>
        <p data-testid="local">{`${local.pathname}${local.search}${local.hash}`}</p>
        <p data-testid="params">{JSON.stringify(params)}</p>
      </div>
    );
  };
  Tela.displayName = `Tela${nome}`;
  return Tela;
}
