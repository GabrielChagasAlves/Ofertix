# Extensão Ofertix — Aprovações

Extensão Manifest V3 para Chrome e Firefox. Injeta um botão flutuante com a marca Ofertix em páginas comuns e abre o painel de aprovação em um iframe isolado, sem substituir a aba atual.

## Recursos

- Login com a conta existente do Ofertix (Supabase Auth).
- Verificação de usuário ativo e da permissão `screen.approval`.
- Lista e filtros de ofertas; deduplicação pelo produto seguindo a regra da tela Aprovação.
- Aprovar somente quando existir link de afiliado `ready` com URL HTTP(S) válida.
- Rejeitar e arquivar ofertas.
- Exibir e abrir link original e link de afiliado.
- Corrigir categoria comercial e origem, gravando a classificação como manual.
- Selecionar variações e salvar os snapshots de preço.
- Ícone flutuante persistente; minimizar o painel sem remover o ícone.

## Segurança

- Usa somente a chave pública `sb_publishable_...` em `config.js`.
- Não contém service role, senha de marketplace, token OAuth ou segredo de automação.
- A sessão do usuário fica no armazenamento local da origem da extensão.
- As operações passam pelas políticas RLS do Supabase e pelas permissões do Ofertix.
- O conteúdo do site visitado não é lido nem enviado ao Supabase; o script injeta somente o botão e o painel.

## Instalação de desenvolvimento — Chrome

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `extension` deste repositório.
5. Abra qualquer site e clique no ícone flutuante Ofertix no canto inferior direito.

## Instalação de desenvolvimento — Firefox

1. Copie `manifest.firefox.json` para `manifest.json` dentro da pasta `extension` (guarde o manifesto do Chrome antes de substituir).
2. Abra `about:debugging#/runtime/this-firefox`.
3. Clique em **Carregar extensão temporária…** e selecione o `manifest.json` da pasta `extension`.
4. Para instalação permanente, a extensão precisará ser assinada pelo serviço de complementos do Firefox (AMO).

## Permissões

A extensão solicita acesso às páginas visitadas para exibir o botão flutuante em qualquer site. O painel se comunica diretamente com o projeto Supabase do Ofertix. Navegadores e páginas internas protegidas (por exemplo, páginas de configurações do próprio navegador e lojas de extensões) não permitem a injeção de extensões.

## Observações de versão

A primeira versão prioriza as ações individuais de aprovação/rejeição e as classificações necessárias para o fluxo. A tela é independente do site aberto e não altera a integração de produtos, OAuth, sincronizadores, cron ou Edge Functions.
