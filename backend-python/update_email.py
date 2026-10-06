import base64
import os
import re

logo_path = r'd:\QUESTION MIND\frontend\src\assets\logo.png'
file_path = r'd:\QUESTION MIND\backend-python\app\services\email_service.py'

with open(logo_path, 'rb') as f:
    b64_logo = base64.b64encode(f.read()).decode('utf-8')

img_tag = f'<div style="text-align: center; margin-bottom: 20px;"><img src="data:image/png;base64,{b64_logo}" alt="Question Mind Logo" style="max-height: 80px; width: auto;" /></div>'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix all remaining markdown stars
content = content.replace('**Question Mind**', '<strong>Question Mind</strong>')
content = content.replace('**', '') # remove any other noisy stars just in case

# Remove previously inserted image tags to avoid duplicates
content = re.sub(r'<div style="text-align: center; margin-bottom: 20px;"><img src="data:image/png;base64,[^"]+" alt="Question Mind Logo" style="max-height: 80px; width: auto;" /></div>\s*', '', content)

target = '<tr><td style="padding:32px;">\n              <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.6;">\n                Hello'
replacement = f'<tr><td style="padding:32px;">\n              {img_tag}\n              <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.6;">\n                Hello'

content = content.replace(target, replacement)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated all templates")
