# CLAUDE.md

## Orquestração de Fluxo de Trabalho

### 1. Nó de Planejamento Padrão
- Entre no modo de planejamento para QUALQUER tarefa não trivial (3+ etapas ou decisões arquiteturais)
- Se algo der errado, PARE e re-planeje imediatamente - não continue forçando
- Use o modo de planejamento para etapas de verificação, não apenas para construção
- Escreva especificações detalhadas antecipadamente para reduzir ambiguidades

### 2. Estratégia de Subagentes
- Use subagentes liberalmente para manter a janela de contexto principal limpa
- Descarregue pesquisa, exploração e análise paralela para subagentes
- Para problemas complexos, jogue mais computação nisso via subagentes
- Uma tarefa por subagente para execução focada

### 3. Loop de Autoaperfeiçoamento
- Após QUALQUER correção do usuário: atualize tasks/lessons.md com o padrão
- Escreva regras para si mesmo que previnam o mesmo erro
- Itere implacavelmente nessas lições até que a taxa de erros caia
- Revise lições no início da sessão para o projeto relevante

### 4. Verificação Antes de Concluir
- Nunca marque uma tarefa como concluída sem provar que funciona
- Compare o comportamento entre o principal e suas mudanças quando relevante
- Pergunte a si mesmo: "Um engenheiro de equipe aprovaria isso?"
- Execute testes, verifique logs, demonstre correção

### 5. Exija Elegância (Equilibrada)
- Para mudanças não triviais: pause e pergunte "há uma maneira mais elegante?"
- Se uma correção parecer hacky: "Sabendo tudo o que sei agora, implemente a solução elegante"
- Pule isso para correções simples e óbvias - não superengenharia
- Desafie seu próprio trabalho antes de apresentá-lo

### 6. Correção Autônoma de Bugs
- Quando receber um relatório de bug: apenas corrija. Não peça para ser guiado pela mão
- Aponte para logs, erros, testes falhando - então resolva-os
- Zero alternância de contexto necessária do usuário
- Vá corrigir testes de CI falhando sem ser dito como

## Gerenciamento de Tarefas
1. Planeje Primeiro: Escreva plano em tasks/todo.md com itens verificáveis
2. Verifique o Plano: Cheque antes de começar a implementação
3. Acompanhe o Progresso: Marque itens como concluídos conforme avança
4. Explique Mudanças: Resumo de alto nível em cada etapa
5. Documente Resultados: Adicione seção de revisão a tasks/todo.md
6. Capture Lições: Atualize tasks/lessons.md após correções

## Princípios Centrais
- Simplicidade em Primeiro Lugar: Faça cada mudança o mais simples possível. Impacte o código mínimo.
- Sem Preguiça: Encontre causas raiz. Sem correções temporárias. Padrões de desenvolvedor sênior.
- Impacto Mínimo: Mudanças devem tocar apenas o necessário. Evite introduzir bugs.
