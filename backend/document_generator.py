"""
Gerador de Documentos Preenchidos (FICHA e OP)
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from datetime import datetime
import io

def generate_ficha_pdf(product_data, batch_data, raw_materials_data):
    """
    Gera PDF da FICHA DE FABRICAÇÃO preenchida
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, 
                           topMargin=1*cm, bottomMargin=1*cm,
                           leftMargin=1.5*cm, rightMargin=1.5*cm)
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Estilo customizado
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=14,
        textColor=colors.HexColor('#000000'),
        spaceAfter=10,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    # Título
    elements.append(Paragraph("FICHA DE FABRICAÇÃO – PROCESSO/ CONTROLE DA QUALIDADE", title_style))
    elements.append(Spacer(1, 0.3*cm))
    
    # Cabeçalho com dados principais
    header_data = [
        ['ORDEM DE PRODUÇÃO Nº:', batch_data.get('op_number', ''), 'DATA:', batch_data.get('date', '')],
        ['PRODUTO:', product_data.get('name', ''), 'LOTE Nº:', batch_data.get('batch_number', '')]
    ]
    
    header_table = Table(header_data, colWidths=[4.5*cm, 5*cm, 3*cm, 4*cm])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#CCCCCC')),
        ('BACKGROUND', (2, 0), (2, -1), colors.HexColor('#CCCCCC')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 0.5*cm))
    
    # Controle de Qualidade Interoperacional
    elements.append(Paragraph("<b>CONTROLE DE QUALIDADE INTEROPERACIONAL</b>", styles['Heading2']))
    elements.append(Spacer(1, 0.3*cm))
    
    qc_data = [
        ['AMOSTRA', '', '', ''],
        ['HORA:', '_______', 'DATA:', '_______'],
        ['', 'ESPECIFICAÇÃO', 'RESULTADO', ''],
        ['ASPECTO', 'Gel', '___________', ''],
        ['COR', 'Incolor', '___________', ''],
        ['ODOR', 'Característico', '___________', ''],
        ['pH', 'ATÉ 11,40', '___________', ''],
        ['VISCOSIDADE a 10%', '10,00 a 11,00', '___________', ''],
    ]
    
    qc_table = Table(qc_data, colWidths=[4*cm, 4*cm, 4*cm, 4*cm])
    qc_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#DDDDDD')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(qc_table)
    elements.append(Spacer(1, 0.5*cm))
    
    # Autorização do Envase
    auth_data = [
        ['AUTORIZADO O ENVASE', '', ''],
        ['HORA:', '__________', 'DATA: __________'],
        ['Assinatura do Analista:', '________________________', '']
    ]
    
    auth_table = Table(auth_data, colWidths=[5*cm, 6*cm, 5*cm])
    auth_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#AAAAAA')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(auth_table)
    elements.append(Spacer(1, 0.5*cm))
    
    # Análise Final
    elements.append(Paragraph("<b>ANÁLISE FINAL – APÓS 24H DA FABRICAÇÃO</b>", styles['Heading2']))
    elements.append(Spacer(1, 0.3*cm))
    
    final_data = [
        ['HORA:', '__________', 'DATA:', '__________'],
        ['', 'ESPECIFICAÇÃO', 'RESULTADO', ''],
        ['ASPECTO', 'Gel', '___________', ''],
        ['COR', 'Incolor', '___________', ''],
        ['pH', 'ATÉ 11,40', '___________', ''],
        ['VISCOSIDADE a 10%', '10,00 a 11,00', '___________', ''],
        ['MASSA ESPECÍFICA', '0,990 a 1,010', '___________', ''],
        ['Observações:', '', '', ''],
        ['', '________________________________________________', '', ''],
        ['Resp. Técnico:', '________________________', '', '']
    ]
    
    final_table = Table(final_data, colWidths=[4*cm, 4*cm, 4*cm, 4*cm])
    final_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(final_table)
    
    # Nova página - Processo de Fabricação
    elements.append(PageBreak())
    elements.append(Paragraph("<b>PROCESSO DE FABRICAÇÃO</b>", title_style))
    elements.append(Spacer(1, 0.5*cm))
    
    # Matérias-primas da receita
    if raw_materials_data:
        process_data = [['ETAPA', 'MATÉRIA-PRIMA', 'QUANTIDADE', 'AÇÃO']]
        
        for idx, rm in enumerate(raw_materials_data, 1):
            process_data.append([
                str(idx),
                rm.get('name', ''),
                f"{rm.get('quantity', '')} {rm.get('unit', '')}",
                rm.get('action', 'Adicionar e homogeneizar')
            ])
        
        process_table = Table(process_data, colWidths=[1.5*cm, 5*cm, 3*cm, 7*cm])
        process_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#CCCCCC')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        elements.append(process_table)
    
    # Rodapé
    elements.append(Spacer(1, 1*cm))
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, alignment=TA_CENTER)
    elements.append(Paragraph(f"Documento gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M')}", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer


def generate_op_pdf(product_data, batch_data, raw_materials_data):
    """
    Gera PDF da ORDEM DE PRODUÇÃO preenchida
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
                           topMargin=1*cm, bottomMargin=1*cm,
                           leftMargin=1.5*cm, rightMargin=1.5*cm)
    
    elements = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#000000'),
        spaceAfter=12,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    # Título
    elements.append(Paragraph("ORDEM DE PRODUÇÃO", title_style))
    elements.append(Spacer(1, 0.5*cm))
    
    # Cabeçalho
    header_data = [
        ['OP Nº:', batch_data.get('op_number', ''), '', ''],
        ['PRODUTO:', product_data.get('name', ''), 'QUANT (Lts):', batch_data.get('planned_quantity', '')],
        ['LOTE:', batch_data.get('batch_number', ''), 'DATA:', batch_data.get('date', '')],
        ['', '', 'Hora I:', '__:__', 'Hora F:', '__:__']
    ]
    
    header_table = Table(header_data, colWidths=[3*cm, 6*cm, 3*cm, 4*cm])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#DDDDDD')),
        ('BACKGROUND', (2, 0), (2, -1), colors.HexColor('#DDDDDD')),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 0.7*cm))
    
    # Tabela de Matérias-Primas
    mp_data = [['CÓD', 'MATÉRIAS-PRIMAS', 'LOTE', 'VALIDADE', '%', 'QUANT. (kg)', 'CORREÇÃO', 'TOTAL', 'OBS']]
    
    if raw_materials_data:
        total_percentage = 0
        total_quantity = 0
        
        for rm in raw_materials_data:
            quantity = rm.get('quantity', 0)
            percentage = (quantity / float(batch_data.get('planned_quantity', 1))) * 100
            
            mp_data.append([
                rm.get('code', ''),
                rm.get('name', ''),
                rm.get('supplier_batch', ''),
                rm.get('expiry_date', ''),
                f"{percentage:.2f}",
                str(quantity),
                '',  # Correção
                '',  # Total
                ''   # OBS
            ])
            
            total_percentage += percentage
            total_quantity += quantity
        
        # Linha de total
        mp_data.append(['', '', '', '', f"{total_percentage:.2f}", str(total_quantity), '', '', ''])
    
    mp_table = Table(mp_data, colWidths=[1.5*cm, 4*cm, 2*cm, 2*cm, 1.5*cm, 2*cm, 1.8*cm, 1.5*cm, 1.2*cm])
    mp_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#AAAAAA')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (4, 1), (7, -1), 'CENTER'),
    ]))
    elements.append(mp_table)
    elements.append(Spacer(1, 0.8*cm))
    
    # Seção de Embalagens
    elements.append(Paragraph("<b>EMBALAGENS</b>", styles['Heading2']))
    elements.append(Spacer(1, 0.3*cm))
    
    emb_data = [
        ['EMBALAGENS', '2LTS', '5 LTS', '20 LTS', '50 LTS', 'TB', 'SOBRA', 'PERDA'],
        ['Peso Bruto', '', '', '', '', '', '', '%'],
        ['Tara', '', '', '', '', '', '', ''],
        ['Peso Líquido', '', '', '', '', '', '', ''],
        ['Quantidade', '', '', '', '', '', '', 'Litros'],
        ['Total (Litros)', '', '', '', '', '', '', '']
    ]
    
    emb_table = Table(emb_data, colWidths=[3*cm, 2*cm, 2*cm, 2*cm, 2*cm, 1.5*cm, 2*cm, 2*cm])
    emb_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#DDDDDD')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
    ]))
    elements.append(emb_table)
    elements.append(Spacer(1, 1*cm))
    
    # Responsáveis e Assinaturas
    resp_data = [
        ['Responsável pela pesagem', '', 'Responsável pela preparação', '', 'Responsável pelo envase', ''],
        ['Ass.', '', 'Ass.', '', 'Ass.', ''],
        ['Nome', '', 'Nome', '', 'Nome', ''],
        ['H Inicio', '', 'H Inicio', '', 'H Inicio', ''],
        ['H Térm', '', 'H Térm', '', 'H Térm', '']
    ]
    
    resp_table = Table(resp_data, colWidths=[4*cm, 1*cm, 4*cm, 1*cm, 4*cm, 1*cm])
    resp_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(resp_table)
    elements.append(Spacer(1, 0.5*cm))
    
    # Conferente/Analista
    conf_data = [
        ['Conferente / Analista', 'Ass.:', '________________', '', 'Ass.:', '________________'],
        ['', 'Nome:', '________________', '', 'Nome:', '________________']
    ]
    
    conf_table = Table(conf_data, colWidths=[4*cm, 2*cm, 3*cm, 1*cm, 2*cm, 3*cm])
    conf_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(conf_table)
    
    # Rodapé
    elements.append(Spacer(1, 0.5*cm))
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, alignment=TA_CENTER)
    elements.append(Paragraph(f"Documento gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M')}", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer
